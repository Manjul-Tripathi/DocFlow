"""
Embedding Service for generating vector embeddings from document analysis results.
Uses LiteLLM with Azure's text-embedding-3-large model for semantic search capabilities.
"""

import os
import json
import logging
import httpx
import asyncio
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

class EmbeddingService:
    """Service for generating vector embeddings from document analysis results."""
    
    def __init__(self):
        """Initialize the embedding service with LiteLLM configuration."""
        env_vars = self._load_env()
        
        if not env_vars["LITELLM_API_URL"] or not env_vars["LITELLM_API_KEY"]:
            raise RuntimeError("Missing LITELLM_API_URL or LITELLM_API_KEY in backend/.env")
        
        self.litellm_api_url = env_vars["LITELLM_API_URL"]
        self.litellm_api_key = env_vars["LITELLM_API_KEY"]
        self.litellm_header_name = env_vars["LITELLM_HEADER_NAME"]
        self.litellm_auth_scheme = env_vars["LITELLM_AUTH_SCHEME"]
        self.model = "azure/text-embedding-ada-002"
        self.max_tokens = 8191  # Maximum tokens for text-embedding-ada-002
        
        logger.info("✅ EmbeddingService initialized with LiteLLM")
    
    def _load_env(self) -> Dict[str, str]:
        """Load environment variables from backend/.env file."""
        try:
            load_dotenv("backend/.env")
            return {
                "LITELLM_API_URL": os.getenv("LITELLM_API_URL", ""),
                "LITELLM_API_KEY": os.getenv("LITELLM_API_KEY", ""),
                "LITELLM_HEADER_NAME": os.getenv("LITELLM_HEADER_NAME", "Authorization"),
                "LITELLM_AUTH_SCHEME": os.getenv("LITELLM_AUTH_SCHEME", "Bearer")
            }
        except Exception as e:
            logger.error(f"Error loading environment variables: {e}")
            return {
                "LITELLM_API_URL": "",
                "LITELLM_API_KEY": "",
                "LITELLM_HEADER_NAME": "Authorization",
                "LITELLM_AUTH_SCHEME": "Bearer"
            }
        
    def _is_base64_image_data(self, value: str) -> bool:
        """Check if a string value is base64-encoded image data."""
        if not isinstance(value, str):
            return False
        
        # Check if it looks like base64 image data
        # Base64 images typically start with data:image/ or are long base64 strings
        if value.startswith('data:image/'):
            return True
        
        # Check for long base64 strings (likely image data)
        if len(value) > 1000 and self._is_base64_string(value):
            return True
            
        return False
    
    def _is_base64_string(self, value: str) -> bool:
        """Check if a string is valid base64."""
        try:
            import base64
            # Check if it's valid base64
            base64.b64decode(value, validate=True)
            # Check if it contains mostly base64 characters
            base64_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=')
            if len(value) > 100 and sum(1 for c in value if c in base64_chars) / len(value) > 0.8:
                return True
            return False
        except:
            return False
    
    def _filter_text_for_embedding(self, text: str) -> str:
        """Filter out base64 image data and other non-text content from text."""
        if not text:
            return text
        
        # Split by common separators and filter out base64 data
        parts = text.split(' | ')
        filtered_parts = []
        
        for part in parts:
            # Skip parts that are base64 image data
            if self._is_base64_image_data(part):
                logger.info(f"🚫 Filtered out base64 image data: {part[:100]}...")
                continue
            
            # Skip very long parts that might be base64 (over 500 chars)
            if len(part) > 500 and self._is_base64_string(part):
                logger.info(f"🚫 Filtered out long base64 string: {part[:100]}...")
                continue
                
            filtered_parts.append(part)
        
        return ' | '.join(filtered_parts)

    def convert_analysis_result_to_text(self, analysis_result: Dict[str, Any]) -> str:
        """
        Convert analysis_result JSONB to structured text for embedding generation.
        
        Args:
            analysis_result: The analysis result dictionary from document processing
            
        Returns:
            Structured text representation of the analysis result
        """
        try:
            text_parts = []
            
            # PRIMARY: Handle hierarchical_data structure (this is the main format used)
            if 'hierarchical_data' in analysis_result and isinstance(analysis_result['hierarchical_data'], dict):
                logger.info(f"📝 Converting hierarchical_data to text for embedding...")
                hierarchical_data = analysis_result['hierarchical_data']
                
                for section_key, section_data in hierarchical_data.items():
                    if isinstance(section_data, dict):
                        # Section has nested fields
                        section_name = section_key.replace('_', ' ').title()
                        section_text = self._convert_hierarchical_section_to_text(section_data, section_name)
                        if section_text:
                            text_parts.append(section_text)
                    elif isinstance(section_data, list):
                        # Section is a list (e.g., table data)
                        section_name = section_key.replace('_', ' ').title()
                        array_text = self._convert_array_to_text(section_data, section_name)
                        if array_text:
                            text_parts.append(array_text)
                    else:
                        # Simple value at section level
                        if section_data and not self._is_base64_image_data(str(section_data)):
                            text_parts.append(f"{section_key.replace('_', ' ').title()}: {section_data}")
                
                logger.info(f"📝 Extracted {len(text_parts)} text sections from hierarchical_data")
            
            # FALLBACK: Handle fields array
            if 'fields' in analysis_result and isinstance(analysis_result['fields'], list):
                logger.info(f"📝 Converting fields array to text for embedding...")
                for field in analysis_result['fields']:
                    if isinstance(field, dict):
                        field_name = field.get('name', field.get('label', 'Unknown Field'))
                        field_value = field.get('value', '')
                        
                        # Handle different value types
                        if isinstance(field_value, dict):
                            # Nested object - convert to readable text
                            nested_text = self._convert_nested_object_to_text(field_value, field_name)
                            text_parts.append(nested_text)
                        elif isinstance(field_value, list):
                            # Array - convert to readable text
                            array_text = self._convert_array_to_text(field_value, field_name)
                            text_parts.append(array_text)
                        else:
                            # Simple value
                            text_parts.append(f"{field_name}: {field_value}")
            
            # FALLBACK: Handle _parsed object
            if '_parsed' in analysis_result and isinstance(analysis_result['_parsed'], dict):
                logger.info(f"📝 Converting _parsed object to text for embedding...")
                parsed_text = self._convert_nested_object_to_text(analysis_result['_parsed'], "Document Data")
                text_parts.append(parsed_text)
            
            # Join all parts
            full_text = " | ".join(text_parts)
            
            # Filter out base64 image data and other non-text content
            filtered_text = self._filter_text_for_embedding(full_text)
            
            # Log filtering results
            if len(filtered_text) < len(full_text):
                logger.info(f"🧹 Filtered text: {len(full_text)} → {len(filtered_text)} characters")
                logger.info(f"🧹 Removed {len(full_text) - len(filtered_text)} characters of non-text data")
            
            # Truncate if still too long (leave some buffer for model limits)
            if len(filtered_text) > self.max_tokens * 3:  # Rough character to token ratio
                filtered_text = filtered_text[:self.max_tokens * 3] + "..."
                logger.warning(f"Truncated analysis result text to fit model limits")
            
            return filtered_text
            
        except Exception as e:
            logger.error(f"Error converting analysis result to text: {e}")
            return "Document analysis result"
    
    def _convert_nested_object_to_text(self, obj: Dict[str, Any], section_name: str = "") -> str:
        """Convert nested object to readable text."""
        try:
            text_parts = []
            
            if section_name:
                text_parts.append(f"{section_name}:")
            
            for key, value in obj.items():
                if isinstance(value, dict):
                    # Recursive call for nested objects
                    nested_text = self._convert_nested_object_to_text(value, key)
                    text_parts.append(nested_text)
                elif isinstance(value, list):
                    # Handle arrays
                    array_text = self._convert_array_to_text(value, key)
                    text_parts.append(array_text)
                else:
                    # Simple key-value pair - filter out base64 image data
                    if isinstance(value, str) and self._is_base64_image_data(value):
                        logger.info(f"🚫 Filtered out base64 image data for field '{key}'")
                        continue
                    text_parts.append(f"{key}: {value}")
            
            return " ".join(text_parts)
            
        except Exception as e:
            logger.error(f"Error converting nested object to text: {e}")
            return f"{section_name}: {str(obj)}"
    
    def _convert_hierarchical_section_to_text(self, section_data: Dict[str, Any], section_name: str = "") -> str:
        """
        Convert a hierarchical_data section to readable text for embeddings.
        Handles the specific structure where each field has 'value' and optionally 'confidence'.
        """
        try:
            text_parts = []
            
            if section_name:
                text_parts.append(f"{section_name}:")
            
            for field_key, field_data in section_data.items():
                if isinstance(field_data, dict):
                    # Check if it's a field with value/confidence structure
                    if 'value' in field_data:
                        field_value = field_data.get('value', '')
                        # Skip base64 image data
                        if isinstance(field_value, str) and self._is_base64_image_data(field_value):
                            logger.debug(f"🚫 Skipping base64 image data for field '{field_key}'")
                            continue
                        # Skip empty values
                        if field_value is None or field_value == '':
                            continue
                        # Format field name nicely
                        field_name = field_key.replace('_', ' ').title()
                        text_parts.append(f"{field_name}: {field_value}")
                    else:
                        # Nested section - recurse
                        nested_text = self._convert_hierarchical_section_to_text(field_data, field_key.replace('_', ' ').title())
                        if nested_text:
                            text_parts.append(nested_text)
                elif isinstance(field_data, list):
                    # Array field
                    array_text = self._convert_array_to_text(field_data, field_key.replace('_', ' ').title())
                    if array_text:
                        text_parts.append(array_text)
                else:
                    # Simple value
                    if field_data is not None and field_data != '':
                        if isinstance(field_data, str) and self._is_base64_image_data(field_data):
                            continue
                        field_name = field_key.replace('_', ' ').title()
                        text_parts.append(f"{field_name}: {field_data}")
            
            return " ".join(text_parts)
            
        except Exception as e:
            logger.error(f"Error converting hierarchical section to text: {e}")
            return f"{section_name}: {str(section_data)}"
    
    def _convert_array_to_text(self, arr: List[Any], field_name: str = "") -> str:
        """Convert array to readable text."""
        try:
            if not arr:
                return f"{field_name}: (empty)"
            
            text_parts = []
            if field_name:
                text_parts.append(f"{field_name}:")
            
            for i, item in enumerate(arr):
                if isinstance(item, dict):
                    # Object in array
                    item_text = self._convert_nested_object_to_text(item, f"Item {i+1}")
                    text_parts.append(item_text)
                elif isinstance(item, list):
                    # Nested array
                    nested_array_text = self._convert_array_to_text(item, f"Item {i+1}")
                    text_parts.append(nested_array_text)
                else:
                    # Simple value - filter out base64 image data
                    if isinstance(item, str) and self._is_base64_image_data(item):
                        logger.info(f"🚫 Filtered out base64 image data in array item {i+1}")
                        continue
                    text_parts.append(f"Item {i+1}: {item}")
            
            return " ".join(text_parts)
            
        except Exception as e:
            logger.error(f"Error converting array to text: {e}")
            return f"{field_name}: {str(arr)}"
    
    def chunk_text(self, text: str, chunk_size: int = 1500, overlap: int = 200) -> List[str]:
        """
        Split text into overlapping chunks for embedding.
        Args:
            text: The full text to split
            chunk_size: Number of characters per chunk (default: 1500)
            overlap: Number of characters to overlap between chunks (default: 200)
        Returns:
            List of text chunks
        """
        if not text:
            return []
        chunks = []
        start = 0
        text_length = len(text)
        while start < text_length:
            end = min(start + chunk_size, text_length)
            chunk = text[start:end]
            chunks.append(chunk)
            if end == text_length:
                break
            start += chunk_size - overlap
        return chunks

    async def generate_embeddings_for_chunks(self, text: str, chunk_size: int = 1500, overlap: int = 200) -> List[Dict[str, Any]]:
        """
        Split text into chunks and generate embeddings for each chunk.
        Returns a list of dicts: [{"chunk": ..., "embedding": [...]}]
        """
        chunks = self.chunk_text(text, chunk_size=chunk_size, overlap=overlap)
        results = []
        for chunk in chunks:
            embedding = await self.generate_embedding(chunk)
            if embedding:
                results.append({"chunk": chunk, "embedding": embedding})
        return results

    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate vector embedding for the given text using LiteLLM with OpenAI's embedding model.
        
        Args:
            text: The text to generate embedding for
            
        Returns:
            List of float values representing the embedding vector, or None if failed
        """
        try:
            if not text or not text.strip():
                logger.warning("Empty text provided for embedding generation")
                return None
            
            # Clean and prepare text
            cleaned_text = text.strip()
            
            # Log the request details at debug level
            logger.debug(f"🚀 Sending embedding request to LiteLLM:")
            logger.debug(f"🚀 Model: {self.model}")
            logger.debug(f"🚀 Input text length: {len(cleaned_text)} characters")
            
            # Prepare request body for LiteLLM embeddings endpoint
            request_body = {
                "model": self.model,
                "input": cleaned_text
            }
            
            # Call LiteLLM embeddings API
            embedding = await self._call_litellm_embeddings_api(request_body)
            
            if embedding:
                logger.info(f"Successfully generated embedding with {len(embedding)} dimensions")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Unexpected error generating embedding: {e}")
            return None
    
    async def _call_litellm_embeddings_api(self, request_body: Dict[str, Any], max_retries: int = 3) -> Optional[List[float]]:
        """Call LiteLLM embeddings API with retry logic."""
        last_exception = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"🌐 Making LiteLLM embeddings API call (attempt {attempt + 1}/{max_retries})")
                
                # For embeddings, we need the base URL without /chat/completions
                # Extract base URL from the configured URL
                base_url = self.litellm_api_url
                if '/chat/completions' in base_url:
                    # Remove /chat/completions to get base URL for embeddings
                    base_url = base_url.replace('/chat/completions', '')
                
                # Construct the embeddings endpoint URL
                embeddings_url = f"{base_url.rstrip('/')}/embeddings"
                
                async with httpx.AsyncClient(timeout=60.0) as client:
                    headers = {
                        "Content-Type": "application/json",
                        self.litellm_header_name: f"{self.litellm_auth_scheme} {self.litellm_api_key}"
                    }
                    
                    response = await client.post(embeddings_url, json=request_body, headers=headers)
                    response.raise_for_status()
                    
                    result = response.json()
                    
                    # Extract embedding from response
                    if "data" in result and len(result["data"]) > 0:
                        embedding = result["data"][0]["embedding"]
                        logger.info(f"✅ Embedding generated successfully")
                        return embedding
                    else:
                        logger.error(f"Unexpected response format: {result}")
                        return None
                        
            except httpx.HTTPStatusError as e:
                last_exception = e
                logger.error(f"HTTP error (attempt {attempt + 1}): {e.response.status_code} - {e.response.text}")
                if e.response.status_code in [400, 401, 403]:
                    # Don't retry on client errors
                    break
            except httpx.TimeoutException as e:
                last_exception = e
                logger.error(f"Timeout error (attempt {attempt + 1}): {e}")
            except Exception as e:
                last_exception = e
                logger.error(f"Unexpected error (attempt {attempt + 1}): {e}")
            
            # Wait before retry
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
        
        logger.error(f"Failed to generate embedding after {max_retries} attempts: {last_exception}")
        return None
    
    async def batch_generate_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts in batch.
        
        Args:
            texts: List of texts to generate embeddings for
            
        Returns:
            List of embedding vectors (or None for failed ones)
        """
        try:
            embeddings = []
            
            for text in texts:
                embedding = await self.generate_embedding(text)
                embeddings.append(embedding)
            
            logger.info(f"Generated {len([e for e in embeddings if e is not None])} embeddings out of {len(texts)} texts")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error in batch embedding generation: {e}")
            return [None] * len(texts)
