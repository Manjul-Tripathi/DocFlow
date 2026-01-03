import os
import httpx
import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

def load_env():
    """Loads environment variables from backend/.env file and returns them as a dict."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_file_path = os.path.join(backend_dir, ".env")
    
    # Load .env file
    load_dotenv(env_file_path)
    
    env_vars = {
        "LITELLM_API_URL": os.getenv("LITELLM_API_URL"),
        "LITELLM_API_KEY": os.getenv("LITELLM_API_KEY"),
        "LITELLM_HEADER_NAME": os.getenv("LITELLM_HEADER_NAME", "Authorization"),
        "LITELLM_AUTH_SCHEME": os.getenv("LITELLM_AUTH_SCHEME", "Bearer"),
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    }
    return env_vars

class SemanticSearchService:
    def __init__(self):
        env_vars = load_env()
        if not env_vars["LITELLM_API_URL"] or not env_vars["LITELLM_API_KEY"]:
            raise RuntimeError("Missing LITELLM_API_URL or LITELLM_API_KEY in backend/.env")
        if not env_vars["SUPABASE_URL"] or not env_vars["SUPABASE_SERVICE_ROLE_KEY"]:
            logger.warning("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env - SemanticSearchService will be disabled")
            self.supabase = None
        else:
            # Initialize Supabase client with error handling for version compatibility
            try:
                self.supabase: Client = create_client(
                    env_vars["SUPABASE_URL"],
                    env_vars["SUPABASE_SERVICE_ROLE_KEY"]
                )
                logger.info("✅ Supabase client initialized successfully for SemanticSearchService")
            except TypeError as e:
                if "proxy" in str(e).lower():
                    logger.error(f"Failed to initialize Supabase client: {e}")
                    logger.error("This is likely a version compatibility issue between supabase-py and httpx/gotrue")
                    logger.error("Try updating supabase-py: pip install --upgrade supabase")
                    logger.warning("SemanticSearchService will be disabled - semantic search features will not work")
                    self.supabase = None
                else:
                    raise
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
                logger.warning("SemanticSearchService will be disabled - semantic search features will not work")
                self.supabase = None
        
        self.litellm_api_url = env_vars["LITELLM_API_URL"]
        self.litellm_api_key = env_vars["LITELLM_API_KEY"]
        self.litellm_header_name = env_vars["LITELLM_HEADER_NAME"]
        self.litellm_auth_scheme = env_vars["LITELLM_AUTH_SCHEME"]

    async def search(self, query: str, limit: int = 10, threshold: float = 0.7, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Perform semantic search on documents."""
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized. Semantic search is disabled.")
        
        try:
            logger.info(f"Processing semantic search for query: {query}")
            
            # Generate embedding for the search query
            query_embedding = await self._generate_embedding(query)
            
            # Build the query with user filtering if userId is provided
            search_query = self.supabase.from_('documents').select("""
                id,
                title,
                description,
                file_name,
                file_path,
                extracted_text,
                created_at,
                updated_at,
                document_type,
                file_size,
                processing_status,
                embedding
            """).not_('embedding', 'is', None)
            
            # Add user filtering if userId is provided
            if user_id:
                search_query = search_query.eq('user_id', user_id)
            
            response = search_query.execute()
            documents = response.data
            
            if not documents:
                logger.warning("No documents found for semantic search")
                return {
                    "results": [],
                    "query": query,
                    "totalFound": 0
                }
            
            # Calculate cosine similarity for each document
            results = []
            for doc in documents:
                if not doc.get('embedding'):
                    continue
                
                # Calculate cosine similarity
                similarity = self._cosine_similarity(query_embedding, doc['embedding'])
                
                if similarity >= threshold:
                    result = {
                        **doc,
                        "similarity": similarity,
                        "relevanceScore": round(similarity * 100)
                    }
                    results.append(result)
            
            # Sort by similarity and limit results
            results.sort(key=lambda x: x['similarity'], reverse=True)
            results = results[:limit]
            
            logger.info(f"Found {len(results)} relevant documents")
            
            return {
                "results": results,
                "query": query,
                "totalFound": len(results)
            }
            
        except Exception as e:
            logger.error(f"Error in semantic search: {str(e)}")
            raise

    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using LiteLLM."""
        async with httpx.AsyncClient() as client:
            headers = {
                self.litellm_header_name: f"{self.litellm_auth_scheme} {self.litellm_api_key}",
                "Content-Type": "application/json"
            }
            
            request_body = {
                "model": "azure/text-embedding-ada-002",
                "input": text
            }
            
            logger.info(f"Generating embedding for text length: {len(text)}")
            
            response = await client.post(
                f"{self.litellm_api_url}/embeddings",
                headers=headers,
                json=request_body,
                timeout=60.0
            )
            
            if not response.is_success:
                error_text = response.text
                logger.error(f"LiteLLM embedding error: {error_text}")
                raise Exception(f"Failed to generate query embedding: {response.status_code}")
            
            embedding_data = response.json()
            return embedding_data["data"][0]["embedding"]

    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        if len(vec_a) != len(vec_b):
            raise ValueError("Vectors must have the same length")
        
        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = sum(a * a for a in vec_a) ** 0.5
        norm_b = sum(b * b for b in vec_b) ** 0.5
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
        
        return dot_product / (norm_a * norm_b)