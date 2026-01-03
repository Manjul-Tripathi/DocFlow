import os
import httpx
import logging
from typing import List, Optional, Dict, Any
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

class GenerateEmbeddingsService:
    def __init__(self):
        env_vars = load_env()
        if not env_vars["LITELLM_API_URL"] or not env_vars["LITELLM_API_KEY"]:
            raise RuntimeError("Missing LITELLM_API_URL or LITELLM_API_KEY in backend/.env")
        
        self.litellm_api_url = env_vars["LITELLM_API_URL"]
        self.litellm_api_key = env_vars["LITELLM_API_KEY"]
        self.litellm_header_name = env_vars["LITELLM_HEADER_NAME"]
        self.litellm_auth_scheme = env_vars["LITELLM_AUTH_SCHEME"]
        
        # Initialize Supabase client if credentials are available
        if env_vars["SUPABASE_URL"] and env_vars["SUPABASE_SERVICE_ROLE_KEY"]:
            try:
                self.supabase: Client = create_client(
                    env_vars["SUPABASE_URL"],
                    env_vars["SUPABASE_SERVICE_ROLE_KEY"]
                )
                logger.info("✅ Supabase client initialized successfully for GenerateEmbeddingsService")
            except TypeError as e:
                if "proxy" in str(e).lower():
                    logger.error(f"Failed to initialize Supabase client: {e}")
                    logger.error("This is likely a version compatibility issue between supabase-py and httpx/gotrue")
                    logger.error("Try updating supabase-py: pip install --upgrade supabase")
                    logger.warning("GenerateEmbeddingsService will be disabled - embedding generation features will not work")
                    self.supabase = None
                else:
                    raise
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
                logger.warning("GenerateEmbeddingsService will be disabled - embedding generation features will not work")
                self.supabase = None
        else:
            self.supabase = None

    async def generate_embeddings(self, text: str, document_id: Optional[str] = None) -> Dict[str, Any]:
        """Generate embeddings for text and optionally update document in database."""
        try:
            logger.info(f"Generating embeddings for text length: {len(text)}")
            
            # Generate embeddings using LiteLLM
            embedding = await self._generate_embedding(text)
            
            logger.info(f"Generated embedding with dimensions: {len(embedding)}")
            
            # Note: Embeddings are stored in document_chunks table, not in documents table
            # The document_id parameter is kept for future use but not used for updates here
            
            return {
                "embedding": embedding,
                "dimensions": len(embedding)
            }
            
        except Exception as e:
            logger.error(f"Error in generate embeddings: {str(e)}")
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
            
            response = await client.post(
                f"{self.litellm_api_url}/embeddings",
                headers=headers,
                json=request_body,
                timeout=60.0
            )
            
            if not response.is_success:
                error_text = response.text
                logger.error(f"LiteLLM embedding error: {error_text}")
                raise Exception(f"Failed to generate embeddings: {response.status_code}")
            
            embedding_data = response.json()
            return embedding_data["data"][0]["embedding"]
