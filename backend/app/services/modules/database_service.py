"""
Database Service
Handles all database operations for document analysis
"""

import logging
from typing import Dict, Any, List, Optional
import os
from datetime import datetime
import uuid

try:
    from supabase import create_client
    SUPABASE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Supabase import failed: {e}")
    create_client = None
    SUPABASE_AVAILABLE = False

logger = logging.getLogger(__name__)

class DatabaseService:
    """Service for database operations"""
    
    def __init__(self):
        self.supabase = self._initialize_supabase()

    def _initialize_supabase(self):
        """Initialize Supabase client"""
        try:
            if not SUPABASE_AVAILABLE:
                logger.warning("Supabase not available, database operations will be disabled")
                return None

            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

            if not supabase_url or not supabase_key:
                logger.warning("Supabase credentials not found, database operations will be disabled")
                return None

            # Try to create client with minimal parameters to avoid proxy issues
            try:
                supabase = create_client(supabase_url, supabase_key)
                logger.info("✅ Supabase client initialized successfully")
                return supabase
            except TypeError as e:
                if 'proxy' in str(e):
                    logger.warning("Supabase client proxy parameter issue, trying alternative initialization")
                    # Try without any additional parameters
                    supabase = create_client(supabase_url, supabase_key)
                    return supabase
                else:
                    raise e

        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            return None

    async def save_document_chunks(
        self,
        document_id: str,
        chunks_data: List[Dict[str, Any]]
    ) -> bool:
        """
        Save document chunks with embeddings to database.
        
        Args:
            document_id: The document ID to associate chunks with
            chunks_data: List of dicts with keys: 'chunk', 'embedding', optionally 'token_count'
            
        Returns:
            True if successful, False otherwise
        """
        if not self.supabase:
            logger.warning("Supabase not available, skipping chunk save")
            return False
        
        try:
            if not chunks_data:
                logger.warning("No chunks provided to save")
                return False
            
            # First, delete any existing chunks for this document
            await self.delete_document_chunks(document_id)
            
            # Prepare chunk records for insertion
            chunk_records = []
            for idx, chunk_data in enumerate(chunks_data):
                chunk_text = chunk_data.get('chunk', '')
                chunk_embedding = chunk_data.get('embedding', None)
                token_count = chunk_data.get('token_count', len(chunk_text) // 4)  # Rough estimate
                
                if not chunk_text or not chunk_embedding:
                    logger.warning(f"Skipping chunk {idx} - missing text or embedding")
                    continue
                
                chunk_records.append({
                    "document_id": document_id,
                    "chunk_index": idx,
                    "chunk_text": chunk_text,
                    "chunk_embedding": chunk_embedding,
                    "token_count": token_count
                })
            
            if not chunk_records:
                logger.warning("No valid chunks to save")
                return False
            
            # Insert all chunks in batch
            logger.info(f"💾 Saving {len(chunk_records)} chunks for document {document_id}")
            chunk_response = self.supabase.table("document_chunks").insert(chunk_records).execute()
            
            if chunk_response.data:
                logger.info(f"✅ Saved {len(chunk_response.data)} chunks successfully")
                return True
            else:
                logger.error("Failed to save chunks - no response data")
                return False
                
        except Exception as e:
            logger.error(f"Error saving document chunks: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
    
    async def delete_document_chunks(self, document_id: str) -> bool:
        """
        Delete all chunks for a document.
        
        Args:
            document_id: The document ID
            
        Returns:
            True if successful, False otherwise
        """
        if not self.supabase:
            return False
        
        try:
            logger.info(f"🗑️ Deleting existing chunks for document {document_id}")
            delete_response = self.supabase.table("document_chunks").delete().eq("document_id", document_id).execute()
            logger.info(f"✅ Deleted old chunks for document {document_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting document chunks: {e}")
            return False

    async def fetch_active_templates(self) -> List[Dict[str, Any]]:
        """Fetch active templates from database (document_templates table)."""
        if not self.supabase:
            logger.warning("Supabase not available, returning empty templates list")
            return []
        
        try:
            logger.info("📋 Fetching templates from database (document_templates)...")
            response = self.supabase.table("document_templates").select("*").execute()
            templates = response.data if response.data else []
            # Prefer active templates when a status column exists
            try:
                templates = [t for t in templates if t.get("status", "active") != "archived"]
            except Exception:
                pass
            
            logger.info(f"✅ Fetched {len(templates)} active templates")
            return templates
            
        except Exception as e:
            logger.error(f"Error fetching templates: {e}")
            return []

    async def save_document_to_database(
        self,
        document_data: str,
        result: Dict[str, Any],
        task: str,
        user_id: str,
        document_name: Optional[str] = None,
        chunks_data: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Dict[str, Any]]:
        """Save document analysis result to database"""
        if not self.supabase:
            logger.warning("Supabase not available, skipping database save")
            return None
        
        try:
            # Only save to database for extraction tasks, not for detection/matching tasks
            extraction_tasks = [
                'template_guided_extraction', 
                'without_template_extraction',
                'field_extraction',  # Alternative name for extraction
                'data_extraction'    # Alternative name for extraction
            ]
            detection_tasks = [
                'template_detection',
                'template_matching', 
                'field_detection',
                'db_template_matching'
            ]
            
            if task in detection_tasks:
                logger.info(f"⏭️ Skipping database save for detection/matching task: {task}")
                return None
            elif task not in extraction_tasks:
                logger.info(f"⏭️ Skipping database save for unknown task: {task}")
                return None
                
            logger.info(f"💾 Saving document to database for task: {task}")

            # Prepare document data for existing schema (no document_data/task_type columns)
            # Map to available columns: user_id, file_name (optional), processing_status, analysis_result, created_at
            inferred_file_name = document_name  # Use passed document name first
            if not inferred_file_name:
                try:
                    # Try common places we may have stored a document name/title
                    inferred_file_name = (
                        result.get("document_info", {}).get("document_title")
                        if isinstance(result, dict) else None
                    )
                except Exception:
                    inferred_file_name = None

            # Upload file to Storage bucket first
            storage_path = None
            file_type = "application/octet-stream"
            file_size_bytes = 0
            
            try:
                import base64
                import uuid
                from datetime import datetime
                
                data_url = document_data or ""
                if data_url.startswith("data:"):
                    # Extract file type and base64 data
                    mime_part = data_url.split(";", 1)[0]
                    if mime_part.startswith("data:"):
                        file_type = mime_part[5:] or file_type
                    
                    base64_part = data_url.split("base64,", 1)[1] if "base64," in data_url else ""
                    if base64_part:
                        # Calculate file size
                        import math
                        padding = base64_part.count("=")
                        file_size_bytes = math.floor((len(base64_part) * 3) / 4) - padding
                        
                        # Upload to Storage bucket
                        file_ext = file_type.split('/')[-1] if '/' in file_type else 'bin'
                        file_name = f"{user_id}/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.{file_ext}"
                        
                        # Decode base64 and upload to storage
                        file_bytes = base64.b64decode(base64_part)
                        
                        # Upload to Supabase Storage
                        storage_response = self.supabase.storage.from_("documents").upload(
                            file_name, 
                            file_bytes,
                            {"content-type": file_type}
                        )
                        
                        # Handle different response formats from Supabase client
                        if hasattr(storage_response, 'data') and storage_response.data:
                            storage_path = storage_response.data.get('path', file_name)
                            logger.info(f"✅ File uploaded to storage: {storage_path}")
                        elif hasattr(storage_response, 'path'):
                            storage_path = storage_response.path
                            logger.info(f"✅ File uploaded to storage: {storage_path}")
                        elif isinstance(storage_response, dict) and 'path' in storage_response:
                            storage_path = storage_response['path']
                            logger.info(f"✅ File uploaded to storage: {storage_path}")
                        else:
                            # If we can't determine the path, use the filename we constructed
                            storage_path = file_name
                            logger.info(f"✅ File uploaded to storage (path unknown): {storage_path}")
                            
            except Exception as e:
                logger.warning(f"Storage upload failed: {e}")
                # Fallback to inline storage
                storage_path = f"inline://{uuid.uuid4()}"

            # Ensure analysis_result is JSON-safe (avoid circular refs / non-serializable types)
            try:
                import json as _json
                # Use a more robust approach to handle circular references
                def json_safe_serializer(obj):
                    if hasattr(obj, '__dict__'):
                        return str(obj)
                    return str(obj)
                
                # Try to serialize with circular reference handling
                safe_result = _json.loads(_json.dumps(result, default=json_safe_serializer, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"Failed to make result JSON-safe: {e}")
                # Fallback: create a minimal safe result
                safe_result = {
                    "template_used": result.get("template_used", "unknown"),
                    "confidence": result.get("confidence", 0.0),
                    "fields_count": len(result.get("fields", [])) if isinstance(result.get("fields"), list) else 0,
                    "error": "Result too complex for database storage"
                }

            # Extract text from chunks_data for extracted_text field (used for chatbot embeddings)
            extracted_text = None
            raw_pdf_text_for_versions = None  # Separate variable for version comparison
            
            # Priority 0 (NEW): Extract raw text directly from PDF for version comparison
            # This ensures V1 and V2 use the same extraction method
            if document_data and file_type and 'pdf' in file_type.lower():
                try:
                    data_url = document_data or ""
                    if "base64," in data_url:
                        base64_part = data_url.split("base64,", 1)[1]
                        file_bytes = base64.b64decode(base64_part)
                        
                        import fitz  # PyMuPDF
                        doc = fitz.open(stream=file_bytes, filetype="pdf")
                        text_parts = []
                        for page_num in range(len(doc)):
                            page = doc[page_num]
                            text = page.get_text("text", sort=True)  # sort=True for better reading order
                            if text.strip():
                                text_parts.append(text.strip())
                        doc.close()
                        
                        raw_pdf_text_for_versions = "\n\n".join(text_parts)
                        logger.info(f"📝 Extracted raw PDF text for version comparison ({len(raw_pdf_text_for_versions)} chars)")
                except Exception as pdf_extract_error:
                    logger.warning(f"Could not extract raw PDF text: {pdf_extract_error}")
            
            # Priority 1: Try to extract from chunks_data (for embeddings/text analysis)
            if chunks_data and len(chunks_data) > 0:
                # Combine all chunks to get full extracted text
                extracted_text = "\n\n".join([
                    chunk.get("chunk", "") for chunk in chunks_data if chunk.get("chunk")
                ])
                logger.info(f"📝 Extracted text from {len(chunks_data)} chunks ({len(extracted_text)} chars)")
            
            # Priority 2: Try to extract raw text from processing result for PDF documents
            if not extracted_text and isinstance(result, dict):
                # Look for raw text in hierarchical_data or field data
                try:
                    if 'hierarchical_data' in result:
                        h_data = result['hierarchical_data']
                        if isinstance(h_data, dict):
                            # Try to extract text values from all sections
                            text_parts = []
                            for section_key, section_data in h_data.items():
                                if isinstance(section_data, dict):
                                    for field_key, field_value in section_data.items():
                                        if isinstance(field_value, str) and len(field_value.strip()) > 0:
                                            # Skip base64 and very long values that look like encoded data
                                            if not field_value.startswith('data:') and len(field_value) < 1000:
                                                text_parts.append(field_value.strip())
                            
                            if text_parts:
                                extracted_text = " ".join(text_parts)
                                logger.info(f"📝 Extracted text from hierarchical_data ({len(extracted_text)} chars)")
                    
                    # Also try the fields array
                    if not extracted_text and 'fields' in result:
                        fields = result['fields']
                        if isinstance(fields, list):
                            text_parts = []
                            for field in fields:
                                if isinstance(field, dict) and 'value' in field:
                                    value = field['value']
                                    if isinstance(value, str) and len(value.strip()) > 0:
                                        if not value.startswith('data:') and len(value) < 1000:
                                            text_parts.append(value.strip())
                            
                            if text_parts:
                                extracted_text = " ".join(text_parts)
                                logger.info(f"📝 Extracted text from fields array ({len(extracted_text)} chars)")
                except Exception as extract_error:
                    logger.warning(f"Could not extract text from processing result: {extract_error}")

            document = {
                "user_id": user_id,
                "file_name": inferred_file_name or "unknown",
                "file_type": file_type,
                "file_size": file_size_bytes,
                "storage_path": storage_path or f"inline://{uuid.uuid4()}",
                "original_url": None,
                "upload_source": "manual",
                "processing_status": "completed",
                "analysis_result": safe_result,
                "extracted_text": extracted_text,  # Store extracted text for chatbot embeddings
                "created_at": datetime.now().isoformat()
            }
            
            # All embeddings are stored in document_chunks table only
            logger.debug("📝 Embeddings will be stored in document_chunks table")
            
            # Insert document (no duplicate check needed - controlled by caller)
            document_response = self.supabase.table("documents").insert(document).execute()
            
            if not document_response.data:
                logger.error("Failed to insert document")
                return None
            
            document_id = document_response.data[0].get("id")
            logger.info(f"✅ Document saved with ID: {document_id}")
            
            # Create Version 1 record in document_versions for version comparison feature
            # Use raw_pdf_text_for_versions if available (for consistent comparison with OnlyOffice edits)
            # Otherwise fall back to extracted_text or storage_path
            try:
                version_content = raw_pdf_text_for_versions or extracted_text or storage_path or f"inline://{uuid.uuid4()}"
                version_record = {
                    "document_id": document_id,
                    "version_number": 1,
                    "content": version_content,  # Store raw PDF text for consistent comparison
                    "change_summary": "Initial upload",
                    "created_by": user_id,
                    "major_version": 1,
                    "minor_version": 0,
                }
                version_response = self.supabase.table("document_versions").insert(version_record).execute()
                if version_response.data:
                    content_source = 'raw PDF text' if raw_pdf_text_for_versions else ('extracted text' if extracted_text else 'storage path')
                    logger.info(f"✅ Created version 1 record for document {document_id} with {content_source} ({len(version_content)} chars)")
                else:
                    logger.warning(f"⚠️ Failed to create version 1 record for document {document_id}")
            except Exception as version_error:
                logger.warning(f"⚠️ Could not create version 1 record: {version_error}")
            
            # Hierarchical data is already saved in analysis_result field
            # No need to save individual fields to document_fields table
            logger.info(f"✅ Hierarchical data saved in analysis_result field")
            
            # Save document chunks if provided
            if chunks_data:
                logger.info(f"💾 Saving {len(chunks_data)} chunks for document {document_id}")
                chunks_saved = await self.save_document_chunks(document_id, chunks_data)
                if chunks_saved:
                    logger.info(f"✅ Document chunks saved successfully")
                else:
                    logger.warning(f"⚠️ Failed to save document chunks")
            
            return {"id": document_id}

            
        except Exception as e:
            logger.error(f"Error saving to database: {e}")
            return None

    async def update_document_in_database(
        self,
        document_id: str,
        result: Dict[str, Any],
        user_id: str,
        chunks_data: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update existing document in database (for manual save with edited data)
        This updates the analysis_result, extracted_text and optionally adds vector embeddings
        """
        if not self.supabase:
            logger.warning("Supabase not available, skipping database update")
            return None
        
        try:
            logger.info(f"💾 Updating document {document_id} in database")
            logger.info(f"📊 Result keys being saved: {list(result.keys()) if result else 'None'}")
            
            # Log hierarchical_data details if present
            if result and 'hierarchical_data' in result:
                h_data = result['hierarchical_data']
                if isinstance(h_data, dict):
                    logger.info(f"📊 hierarchical_data sections: {[k for k in h_data.keys() if not k.startswith('_')]}")
            
            # Verify document exists and belongs to user
            existing_doc = self.supabase.table("documents").select("id, user_id").eq("id", document_id).execute()
            
            if not existing_doc.data:
                logger.error(f"Document {document_id} not found")
                return None
            
            if existing_doc.data[0].get("user_id") != user_id:
                logger.error(f"Document {document_id} does not belong to user {user_id}")
                return None
            
            # Ensure analysis_result is JSON-safe
            try:
                import json as _json
                def json_safe_serializer(obj):
                    if hasattr(obj, '__dict__'):
                        return str(obj)
                    return str(obj)
                safe_result = _json.loads(_json.dumps(result, default=json_safe_serializer, ensure_ascii=False))
                logger.info(f"✅ Result converted to JSON-safe format")
            except Exception as e:
                logger.warning(f"Failed to make result JSON-safe: {e}")
                safe_result = result
            
            # Extract text from chunks_data for extracted_text field (used for chatbot embeddings)
            # This keeps documents.extracted_text always up-to-date with latest version
            extracted_text = None
            
            # Priority 1: Try to extract from chunks_data (for embeddings/text analysis)
            if chunks_data and len(chunks_data) > 0:
                extracted_text = "\n\n".join([
                    chunk.get("chunk", "") for chunk in chunks_data if chunk.get("chunk")
                ])
                logger.info(f"📝 Extracted text from {len(chunks_data)} chunks ({len(extracted_text)} chars) for update")
            
            # Priority 2: Try to extract raw text from processing result for PDF documents
            if not extracted_text and isinstance(result, dict):
                try:
                    if 'hierarchical_data' in result:
                        h_data = result['hierarchical_data']
                        if isinstance(h_data, dict):
                            # Try to extract text values from all sections
                            text_parts = []
                            for section_key, section_data in h_data.items():
                                if isinstance(section_data, dict):
                                    for field_key, field_value in section_data.items():
                                        if isinstance(field_value, str) and len(field_value.strip()) > 0:
                                            # Skip base64 and very long values that look like encoded data
                                            if not field_value.startswith('data:') and len(field_value) < 1000:
                                                text_parts.append(field_value.strip())
                            
                            if text_parts:
                                extracted_text = " ".join(text_parts)
                                logger.info(f"📝 Extracted text from hierarchical_data ({len(extracted_text)} chars) for update")
                    
                    # Also try the fields array
                    if not extracted_text and 'fields' in result:
                        fields = result['fields']
                        if isinstance(fields, list):
                            text_parts = []
                            for field in fields:
                                if isinstance(field, dict) and 'value' in field:
                                    value = field['value']
                                    if isinstance(value, str) and len(value.strip()) > 0:
                                        if not value.startswith('data:') and len(value) < 1000:
                                            text_parts.append(value.strip())
                            
                            if text_parts:
                                extracted_text = " ".join(text_parts)
                                logger.info(f"📝 Extracted text from fields array ({len(extracted_text)} chars) for update")
                except Exception as extract_error:
                    logger.warning(f"Could not extract text from processing result: {extract_error}")
            
            # Build update data
            update_data = {
                "analysis_result": safe_result,
                "updated_at": datetime.now().isoformat()
            }
            
            # Update extracted_text if we have new text (keeps latest version for chatbot)
            if extracted_text:
                update_data["extracted_text"] = extracted_text
            
            # All embeddings are stored in document_chunks table only
            logger.debug("📝 Embeddings will be updated in document_chunks table")
            
            # Update document
            logger.info(f"💾 Executing database UPDATE for document {document_id}")
            update_response = self.supabase.table("documents").update(update_data).eq("id", document_id).execute()
            
            if not update_response.data:
                logger.error(f"Failed to update document {document_id} - no response data")
                return None
            
            # Update document chunks if provided
            if chunks_data:
                logger.info(f"💾 Updating {len(chunks_data)} chunks for document {document_id}")
                chunks_saved = await self.save_document_chunks(document_id, chunks_data)
                if chunks_saved:
                    logger.info(f"✅ Document chunks updated successfully")
                else:
                    logger.warning(f"⚠️ Failed to update document chunks")
            
            logger.info(f"✅ Document {document_id} updated successfully with edited data and extracted_text")
            return {"id": document_id, "updated": True}
            
        except Exception as e:
            logger.error(f"Error updating document in database: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None

    async def normalize_template_matches_with_db(self, processed_result: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize template matching results with database templates"""
        if not self.supabase:
            return processed_result
        
        try:
            logger.info("🔄 Normalizing template matches with database...")
            
            # Get the matched template ID from the result
            matched_template_id = processed_result.get("matched_template_id")
            if not matched_template_id:
                logger.warning("No matched template ID found in result")
                return processed_result
            
            # Fetch template details from database (document_templates)
            template_response = self.supabase.table("document_templates").select("*").eq("id", matched_template_id).execute()
            
            if not template_response.data:
                logger.warning(f"Template with ID {matched_template_id} not found in database")
                return processed_result
            
            template_data = template_response.data[0]
            template_name = template_data.get("name", "Unknown Template")
            
            # Update the result with template information
            result = processed_result.copy()
            result["matched_template_name"] = template_name
            result["template_confidence"] = processed_result.get("confidence", 0.0)
            
            logger.info(f"✅ Normalized template match: {template_name}")
            return result
            
        except Exception as e:
            logger.error(f"Error normalizing template matches: {e}")
            return processed_result

    def save_failed_processing(
        self,
        user_id: str,
        file_name: str,
        file_type: str,
        file_size: int,
        storage_path: str,
        error_message: str,
        document_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Save a failed processing attempt to the database for tracking.
        
        Args:
            user_id: User ID who uploaded the document
            file_name: Name of the file
            file_type: MIME type of the file
            file_size: Size of the file in bytes
            storage_path: Path to the stored file
            error_message: Error message describing the failure
            document_type: Type of document (optional)
            
        Returns:
            Document ID if saved successfully, None otherwise
        """
        try:
            if not self.supabase:
                logger.warning("Supabase not available, cannot save failed processing")
                return None
            
            document = {
                "user_id": user_id,
                "file_name": file_name,
                "file_type": file_type,
                "file_size": file_size,
                "storage_path": storage_path,
                "processing_status": "failed",
                "metadata": {
                    "error": error_message,
                    "error_timestamp": datetime.now().isoformat()
                },
                "document_type": document_type or "unknown",
                "created_at": datetime.now().isoformat()
            }
            
            # Insert document
            document_response = self.supabase.table("documents").insert(document).execute()
            
            if not document_response.data:
                logger.error("Failed to insert failed processing record")
                return None
            
            document_id = document_response.data[0].get("id")
            logger.info(f"✅ Failed processing record saved with ID: {document_id}")
            
            return {"id": document_id}
            
        except Exception as e:
            logger.error(f"Error saving failed processing: {e}")
            return None
