"""
RAG (Retrieval-Augmented Generation) Service
Combines semantic search with LLM-based answer generation
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

class RAGService:
    """Service for Retrieval-Augmented Generation using semantic search + LLM."""
    
    def __init__(self):
        """Initialize RAG service with required components."""
        self._load_env()
        
        # Import services
        from .semantic_search_service import SemanticSearchService
        from .llm_client import LLMClient
        
        self.semantic_search = SemanticSearchService()
        self.llm_client = LLMClient()
        
        logger.info("✅ RAGService initialized successfully")
    
    def _load_env(self):
        """Load environment variables."""
        try:
            load_dotenv("backend/.env")
        except Exception as e:
            logger.error(f"Error loading environment variables: {e}")
    
    async def ask_question(
        self,
        question: str,
        user_id: str,
        max_documents: int = 3,
        similarity_threshold: float = 0.3,
        include_sources: bool = True
    ) -> Dict[str, Any]:
        """
        Ask a question and get an AI-generated answer using retrieved documents.
        
        Args:
            question: The question to answer
            user_id: User ID for document access
            max_documents: Maximum number of documents to retrieve
            similarity_threshold: Minimum similarity score for documents
            include_sources: Whether to include source document information
            
        Returns:
            Dictionary containing answer, sources, and metadata
        """
        try:
            logger.info(f"🤖 RAG Question: '{question}'")
            
            # Step 1: Retrieve relevant documents
            logger.info("🔍 Step 1: Retrieving relevant documents...")
            search_results = await self.semantic_search.search_documents(
                query=question,
                user_id=user_id,
                limit=max_documents,
                similarity_threshold=similarity_threshold
            )
            
            # Debug: Log what documents were retrieved
            logger.info(f"🔍 Retrieved {len(search_results.get('results', []))} documents")
            for i, doc in enumerate(search_results.get('results', [])):
                logger.info(f"🔍 Document {i+1}: {doc.get('file_name', 'Unknown')} (Score: {doc.get('similarity_score', 0):.3f})")
                logger.info(f"🔍 Document {i+1} analysis_result keys: {list(doc.get('analysis_result', {}).keys())}")
            
            if not search_results or not search_results.get('results'):
                return {
                    "answer": "I couldn't find any relevant documents to answer your question. Please make sure you have uploaded documents and try rephrasing your question.",
                    "sources": [],
                    "confidence": 0.0,
                    "metadata": {
                        "documents_retrieved": 0,
                        "similarity_threshold": similarity_threshold,
                        "question": question
                    }
                }
            
            retrieved_docs = search_results['results']
            logger.info(f"✅ Retrieved {len(retrieved_docs)} documents")
            
            # Step 2: Extract context from retrieved documents
            logger.info("📄 Step 2: Extracting context from documents...")
            context_data = self._extract_context_from_documents(retrieved_docs)
            logger.info(f"📄 Context extracted: {len(context_data)} characters")
            logger.debug(f"📄 Complete context being sent to LLM:")
            logger.debug(f"📄 START CONTEXT ---")
            logger.debug(context_data)
            logger.debug(f"📄 END CONTEXT ---")
            
            # Step 3: Generate answer using LLM
            logger.info("🧠 Step 3: Generating answer with LLM...")
            answer_result = await self._generate_answer_with_context(question, context_data)
            
            # Step 4: Prepare response
            response = {
                "answer": answer_result.get("answer", "I couldn't generate an answer based on the retrieved documents."),
                "confidence": answer_result.get("confidence", 0.0),
                "metadata": {
                    "documents_retrieved": len(retrieved_docs),
                    "similarity_threshold": similarity_threshold,
                    "question": question,
                    "context_length": len(context_data),
                    "model_used": answer_result.get("model", "unknown")
                }
            }
            
            # Add sources if requested, but only those that contributed to the answer
            if include_sources:
                all_sources = self._format_sources(retrieved_docs)
                answer_text = response["answer"]
                # Only include sources whose file_name appears in the answer
                filtered_sources = []
                for doc, src in zip(retrieved_docs, all_sources):
                    file_name = src.get("file_name", "")
                    # Try to match file_name or any excerpt in the answer
                    excerpt = ""
                    # Try to get excerpt from analysis_result if available
                    analysis_result = doc.get("analysis_result", {})
                    if "hierarchical_data" in analysis_result:
                        for section in analysis_result["hierarchical_data"].values():
                            if isinstance(section, dict):
                                for v in section.values():
                                    if isinstance(v, dict) and "value" in v:
                                        excerpt_candidate = str(v["value"])
                                        if excerpt_candidate and excerpt_candidate in answer_text:
                                            excerpt = excerpt_candidate
                                            break
                    # If file_name or excerpt is in answer, include this source
                    if (file_name and file_name in answer_text) or (excerpt and excerpt in answer_text):
                        filtered_sources.append(src)
                # If nothing matched, fallback to top-1 source (most relevant)
                if not filtered_sources and all_sources:
                    filtered_sources = [all_sources[0]]
                response["sources"] = filtered_sources
            
            logger.info(f"✅ RAG answer generated successfully")
            return response
            
        except Exception as e:
            logger.error(f"❌ Error in RAG question answering: {e}")
            return {
                "answer": f"I encountered an error while processing your question: {str(e)}",
                "sources": [],
                "confidence": 0.0,
                "metadata": {
                    "error": str(e),
                    "question": question
                }
            }
    
    def _extract_context_from_documents(self, documents: List[Dict[str, Any]]) -> str:
        """Extract relevant context from retrieved documents."""
        try:
            context_parts = []
            
            for i, doc in enumerate(documents, 1):
                doc_name = doc.get('file_name', f'Document {i}')
                similarity_score = doc.get('similarity_score', 0.0)
                analysis_result = doc.get('analysis_result', {})
                
                # Debug: Log ALL available keys in the document
                logger.info(f"📋 Document {i} available keys: {list(doc.keys())}")
                logger.debug(f"📋 Document {i} debug:")
                logger.debug(f"   - ID: {doc.get('id', 'Unknown')}")
                logger.debug(f"   - Name: {doc_name}")
                logger.debug(f"   - Has chunk_text: {bool(doc.get('chunk_text'))}")
                logger.debug(f"   - Has extracted_text: {bool(doc.get('extracted_text'))}")
                logger.debug(f"   - Analysis result type: {type(analysis_result)}")
                logger.debug(f"   - Analysis result content: {str(analysis_result)[:200]}...")
                
                # Add document header
                context_parts.append(f"--- Document {i}: {doc_name} (Relevance: {similarity_score:.3f}) ---")
                
                # Extract fields from analysis result OR use chunk_text as fallback
                logger.info(f"📋 Analysis result keys: {list(analysis_result.keys()) if analysis_result else 'None'}")
                
                # PRIORITY 1: Use chunk_text if available (from document_chunks table)
                chunk_text = doc.get('chunk_text', '')
                if chunk_text and chunk_text.strip():
                    logger.info(f"📋 Using chunk_text for document {i} ({len(chunk_text)} characters)")
                    context_parts.append(chunk_text)
                
                # PRIORITY 2: Handle hierarchical_data structure (from analysis_result)
                elif analysis_result and 'hierarchical_data' in analysis_result:
                    hierarchical_data = analysis_result['hierarchical_data']
                    logger.info(f"📋 Processing hierarchical_data with {len(hierarchical_data)} sections")
                    
                    for section_key, section_data in hierarchical_data.items():
                        if isinstance(section_data, dict):
                            # Section has nested fields
                            section_name = section_key.replace('_', ' ').title()
                            section_text = self._convert_hierarchical_section_to_text(section_data, section_name)
                            if section_text:
                                context_parts.append(section_text)
                        elif isinstance(section_data, list):
                            # Section is a list (e.g., table data)
                            section_name = section_key.replace('_', ' ').title()
                            array_text = f"{section_name}: {', '.join(map(str, section_data))}"
                            context_parts.append(array_text)
                        else:
                            # Simple value at section level
                            if section_data and not self._is_base64_image_data(str(section_data)):
                                field_name = section_key.replace('_', ' ').title()
                                context_parts.append(f"{field_name}: {section_data}")
                
                # PRIORITY 3: Handle fields array
                elif analysis_result and 'fields' in analysis_result:
                    fields = analysis_result['fields']
                    logger.info(f"📋 Found {len(fields)} fields in document {i}")
                    
                    for field in fields:
                        field_name = field.get('name', 'Unknown Field')
                        field_value = field.get('value', '')
                        logger.info(f"📋 Field: {field_name}, Value type: {type(field_value)}, Value: {str(field_value)[:100]}...")
                        
                        # Format field value based on type
                        if isinstance(field_value, dict):
                            # Nested object - format as key-value pairs
                            field_text = f"{field_name}: "
                            field_items = []
                            for key, value in field_value.items():
                                if value is not None and value != "":
                                    field_items.append(f"{key}: {value}")
                            field_text += ", ".join(field_items)
                            context_parts.append(field_text)
                        elif isinstance(field_value, list):
                            # Array - format as list
                            field_text = f"{field_name}: {', '.join(map(str, field_value))}"
                            context_parts.append(field_text)
                        else:
                            # Simple value
                            if field_value:
                                context_parts.append(f"{field_name}: {field_value}")
                
                # PRIORITY 4: Use extracted_text as last resort
                elif doc.get('extracted_text'):
                    extracted_text = doc.get('extracted_text', '')
                    if extracted_text.strip():
                        logger.info(f"📋 Using extracted_text for document {i} ({len(extracted_text)} characters)")
                        # Limit to first 2000 characters to avoid overwhelming context
                        context_parts.append(extracted_text[:2000])
                
                else:
                    logger.warning(f"⚠️ No content found for document {i} (no chunk_text, analysis_result, or extracted_text)")
                
                context_parts.append("")  # Empty line between documents
            
            return "\n".join(context_parts)
            
        except Exception as e:
            logger.error(f"Error extracting context: {e}")
            return "Error extracting context from documents."
    
    async def _generate_answer_with_context(self, question: str, context: str) -> Dict[str, Any]:
        """Generate answer using LLM with retrieved context."""
        try:
            # Create RAG prompt
            prompt = self._create_rag_prompt(question, context)
            
            # Call LLM with plain text response format
            response = await self.llm_client.call_api(
                prompt=prompt,
                image_data=None,  # No image for text-only generation
                response_format={"type": "text"},  # Force plain text response
                task="text_completion",  # Use a task that doesn't enforce JSON
                document_name="RAG Question Answering"
            )
            
            if response and response.get('success'):
                result_data = response.get('result', '')
                logger.info(f"🔍 Raw LLM response result: {result_data}")
                logger.info(f"🔍 Raw LLM response result type: {type(result_data)}")
                
                # Handle different response formats
                if isinstance(result_data, dict):
                    # LLM returned structured JSON response - extract answer
                    logger.info(f"🔍 LLM returned structured response with keys: {list(result_data.keys())}")
                    
                    # For RAG, we expect the answer to be in a specific field
                    answer_text = (
                        result_data.get('answer') or
                        result_data.get('response') or
                        result_data.get('result') or
                        result_data.get('text') or
                        result_data.get('rag_answer') or
                        str(result_data)  # Fallback to string representation
                    )
                    
                    # If it's still a dict, look for common answer fields
                    if isinstance(answer_text, dict):
                        # Try to find an answer in common fields
                        for key in ['answer', 'response', 'result', 'text', 'output']:
                            if key in answer_text and isinstance(answer_text[key], str):
                                answer_text = answer_text[key]
                                break
                        else:
                            # If no text field found, convert to string
                            answer_text = str(answer_text)
                    
                    logger.info(f"🔍 Extracted answer from structured response: {answer_text[:200]}...")
                else:
                    # LLM returned plain text
                    answer_text = str(result_data)
                    logger.info(f"🔍 LLM returned plain text: {answer_text[:200]}...")
                
                # Try to extract confidence from response
                confidence = self._extract_confidence_from_answer(answer_text)
                
                return {
                    "answer": answer_text,
                    "confidence": confidence,
                    "model": response.get('model', 'unknown')
                }
            
            if response and response.get('success'):
                result_data = response.get('result', '')
                logger.info(f"🔍 Raw LLM response result: {result_data}")
                logger.info(f"🔍 Raw LLM response result type: {type(result_data)}")
                
                # Handle different response formats
                if isinstance(result_data, dict):
                    # LLM returned structured JSON response
                    logger.info(f"🔍 LLM returned structured response with keys: {list(result_data.keys())}")
                    
                    # Try to extract answer from various possible fields
                    answer_text = (
                        result_data.get('answer') or
                        result_data.get('response') or
                        result_data.get('result') or
                        result_data.get('text') or
                        str(result_data)  # Fallback to string representation
                    )
                    
                    logger.info(f"🔍 Extracted answer_text before field processing: {answer_text}")
                    logger.info(f"🔍 answer_text type: {type(answer_text)}")
                    
                    # If answer is still a dict, try to extract from fields
                    if isinstance(answer_text, dict) and 'fields' in answer_text:
                        logger.info(f"🔍 Processing fields structure: {answer_text['fields']}")
                        fields = answer_text['fields']
                        if isinstance(fields, list) and len(fields) > 0:
                            # Extract answer from first field
                            first_field = fields[0]
                            logger.info(f"🔍 First field: {first_field}")
                            if isinstance(first_field, dict):
                                answer_text = first_field.get('value', first_field.get('answer', str(first_field)))
                            else:
                                answer_text = str(first_field)
                        else:
                            answer_text = str(fields)
                    
                    logger.info(f"🔍 Final extracted answer: {answer_text[:200]}...")
                else:
                    # LLM returned plain text
                    answer_text = str(result_data)
                    logger.info(f"🔍 LLM returned plain text: {answer_text[:200]}...")
                
                # Try to extract confidence from response
                confidence = self._extract_confidence_from_answer(answer_text)
                
                return {
                    "answer": answer_text,
                    "confidence": confidence,
                    "model": response.get('model', 'unknown')
                }
            else:
                # Handle case where LLM returns plain text instead of JSON
                raw_response = response.get('raw_response', '') if response else ''
                if raw_response:
                    confidence = self._extract_confidence_from_answer(raw_response)
                    return {
                        "answer": raw_response,
                        "confidence": confidence,
                        "model": response.get('model', 'unknown')
                    }
                else:
                    return {
                        "answer": "I couldn't generate an answer based on the retrieved documents.",
                        "confidence": 0.0,
                        "model": "unknown"
                    }
                
        except Exception as e:
            logger.error(f"Error generating answer: {e}")
            return {
                "answer": f"Error generating answer: {str(e)}",
                "confidence": 0.0,
                "model": "unknown"
            }
    
    def _create_rag_prompt(self, question: str, context: str) -> str:
        """Create a prompt for RAG-based question answering."""
        prompt = f"""You are an AI assistant that answers questions based on retrieved document context. Use only the information provided in the context to answer the question.

CONTEXT:
{context}

QUESTION: {question}

INSTRUCTIONS:
1. Answer the question using ONLY the information provided in the context above
2. Be specific and accurate
3. If the information is not available in the context, say "The information is not available in the retrieved documents"
4. If multiple documents contain relevant information, synthesize the answer from all sources
5. Include specific details like names, numbers, dates when available
6. Keep your answer concise but complete
7. At the end, add your confidence level as "Confidence: X%" where X is 0-100

IMPORTANT: Look for the father's name in fields like "Father Name" or similar. The context contains document information that may have the answer.

ANSWER:"""
        logger.debug(f"🔍 RAG Prompt being sent to LLM:")
        logger.debug(prompt)
        return prompt
    
    def _extract_confidence_from_answer(self, answer: str) -> float:
        """Extract confidence score from LLM answer."""
        try:
            # Look for "Confidence: X%" pattern
            import re
            confidence_match = re.search(r'Confidence:\s*(\d+)%', answer)
            if confidence_match:
                return float(confidence_match.group(1)) / 100.0
            
            # If no explicit confidence, estimate based on answer content
            if "not available" in answer.lower() or "couldn't" in answer.lower():
                return 0.1
            elif "might be" in answer.lower() or "possibly" in answer.lower():
                return 0.5
            else:
                return 0.8  # Default confidence for direct answers
                
        except Exception:
            return 0.5  # Default confidence
    
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
    
    def _convert_hierarchical_section_to_text(self, section_data: Dict[str, Any], section_name: str = "") -> str:
        """
        Convert a hierarchical_data section to readable text for RAG context.
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
                    array_text = f"{field_key.replace('_', ' ').title()}: {', '.join(map(str, field_data))}"
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
    
    def _format_sources(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format source documents for the response."""
        sources = []
        
        for doc in documents:
            source = {
                "file_name": doc.get('file_name', 'Unknown'),
                "similarity_score": doc.get('similarity_score', 0.0),
                "file_type": doc.get('file_type', 'Unknown'),
                "created_at": doc.get('created_at', 'Unknown'),
                "document_id": doc.get('id', 'Unknown')
            }
            sources.append(source)
        
        return sources
    
    async def get_document_summary(
        self,
        document_id: str,
        user_id: str,
        summary_type: str = "brief"
    ) -> Dict[str, Any]:
        """
        Generate a summary of a specific document.
        
        Args:
            document_id: ID of the document to summarize
            user_id: User ID for access control
            summary_type: Type of summary ("brief", "detailed", "key_points")
            
        Returns:
            Dictionary containing summary and metadata
        """
        try:
            logger.info(f"📄 Generating {summary_type} summary for document {document_id}")
            
            # Get document details
            from supabase import create_client
            
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            supabase = create_client(supabase_url, supabase_key)
            
            response = supabase.table("documents").select("*").eq("id", document_id).eq("user_id", user_id).execute()
            
            if not response.data:
                return {
                    "summary": "Document not found or access denied.",
                    "metadata": {"error": "Document not found"}
                }
            
            doc = response.data[0]
            analysis_result = doc.get('analysis_result', {})
            
            # Extract document content
            context = self._extract_context_from_documents([doc])
            
            # Generate summary based on type
            if summary_type == "brief":
                prompt = f"Provide a brief 2-3 sentence summary of this document:\n\n{context}"
            elif summary_type == "detailed":
                prompt = f"Provide a detailed summary of this document, including all key information:\n\n{context}"
            elif summary_type == "key_points":
                prompt = f"Extract the key points from this document in bullet format:\n\n{context}"
            else:
                prompt = f"Summarize this document:\n\n{context}"
            
            # Generate summary
            summary_response = await self.llm_client.call_api(
                prompt=prompt,
                image_data=None,  # No image for text-only generation
                response_format={"type": "text"},
                task="document_summarization",
                document_name=f"Document Summary - {summary_type}"
            )
            
            if summary_response and summary_response.get('success'):
                return {
                    "summary": summary_response.get('result', ''),
                    "metadata": {
                        "document_id": document_id,
                        "file_name": doc.get('file_name', 'Unknown'),
                        "summary_type": summary_type,
                        "model_used": summary_response.get('model', 'unknown')
                    }
                }
            else:
                return {
                    "summary": "Could not generate summary.",
                    "metadata": {"error": "LLM generation failed"}
                }
                
        except Exception as e:
            logger.error(f"Error generating document summary: {e}")
            return {
                "summary": f"Error generating summary: {str(e)}",
                "metadata": {"error": str(e)}
            }
