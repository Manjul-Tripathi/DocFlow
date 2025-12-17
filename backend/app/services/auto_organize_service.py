"""
Auto Organize Service
Automatically organizes documents into folders based on document type.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from dotenv import load_dotenv
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

# Color mapping for different document types
DOCUMENT_TYPE_COLORS = {
    'invoice': '#7c3aed',       # Purple
    'receipt': '#059669',       # Green
    'contract': '#dc2626',      # Red
    'agreement': '#dc2626',     # Red
    'legal': '#b91c1c',         # Dark Red
    'financial': '#7c3aed',     # Purple
    'report': '#2563eb',        # Blue
    'identity': '#0891b2',      # Cyan
    'certificate': '#ca8a04',   # Yellow
    'medical': '#be185d',       # Pink
    'insurance': '#4f46e5',     # Indigo
    'tax': '#ea580c',           # Orange
    'travel': '#0d9488',        # Teal
    'education': '#8b5cf6',     # Violet
    'employment': '#3b82f6',    # Blue
    'government': '#6366f1',    # Indigo
    'personal': '#10b981',      # Emerald
    'other': '#6b7280',         # Gray
}

# Icon mapping for document types
DOCUMENT_TYPE_ICONS = {
    'invoice': 'Receipt',
    'receipt': 'Receipt',
    'contract': 'Briefcase',
    'agreement': 'Briefcase',
    'legal': 'Briefcase',
    'financial': 'Receipt',
    'report': 'FileText',
    'identity': 'User',
    'certificate': 'Award',
    'medical': 'FileText',
    'insurance': 'FileText',
    'tax': 'Receipt',
    'travel': 'FileText',
    'education': 'Award',
    'employment': 'User',
    'government': 'FileText',
    'personal': 'User',
    'other': 'Folder',
}


def load_env():
    """Loads environment variables from backend/.env file."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_file_path = os.path.join(backend_dir, ".env")
    load_dotenv(env_file_path)
    
    return {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    }


class AutoOrganizeService:
    """Service for automatically organizing documents into folders by document type."""
    
    def __init__(self):
        env_vars = load_env()
        if not env_vars["SUPABASE_URL"] or not env_vars["SUPABASE_SERVICE_ROLE_KEY"]:
            logger.warning("Missing Supabase credentials - AutoOrganizeService will be disabled")
            self.supabase = None
            return
        
        try:
            self.supabase: Client = create_client(
                env_vars["SUPABASE_URL"],
                env_vars["SUPABASE_SERVICE_ROLE_KEY"]
            )
            logger.info("✅ AutoOrganizeService initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            self.supabase = None

    async def auto_organize_by_document_type(self, user_id: str) -> Dict[str, Any]:
        """
        Automatically organize all documents by their document_type.
        Creates folders for each document type and assigns documents to them.
        """
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            logger.info(f"🗂️ Starting auto-organization for user: {user_id}")
            
            # Step 1: Get all documents for the user
            docs_response = self.supabase.from_('documents').select(
                'id, file_name, document_type, metadata'
            ).eq('user_id', user_id).execute()
            
            if not docs_response.data:
                logger.info("No documents found for user")
                return {
                    "success": True,
                    "foldersCreated": [],
                    "documentsOrganized": 0,
                    "message": "No documents found to organize"
                }
            
            documents = docs_response.data
            logger.info(f"📄 Found {len(documents)} documents to organize")
            
            # Step 2: Group documents by document_type
            documents_by_type: Dict[str, List[Dict]] = {}
            for doc in documents:
                doc_type = doc.get('document_type') or 'other'
                # Normalize document type
                doc_type = doc_type.lower().replace('-', '_').replace(' ', '_')
                
                if doc_type not in documents_by_type:
                    documents_by_type[doc_type] = []
                documents_by_type[doc_type].append(doc)
            
            logger.info(f"📊 Document types found: {list(documents_by_type.keys())}")
            
            # Step 3: Get existing smart folders for this user
            existing_folders_response = self.supabase.from_('smart_folders').select(
                'id, name, filter_rules'
            ).eq('user_id', user_id).execute()
            
            existing_folders = {f['name'].lower(): f for f in (existing_folders_response.data or [])}
            
            # Create a mapping for fuzzy matching (handles typos, plural/singular, etc.)
            def calculate_similarity(str1: str, str2: str) -> float:
                """Calculate similarity ratio between two strings (0.0 to 1.0)."""
                str1, str2 = str1.lower(), str2.lower()
                if str1 == str2:
                    return 1.0
                
                # Calculate Levenshtein distance
                if len(str1) < len(str2):
                    str1, str2 = str2, str1
                
                if len(str2) == 0:
                    return 0.0
                
                previous_row = range(len(str2) + 1)
                for i, c1 in enumerate(str1):
                    current_row = [i + 1]
                    for j, c2 in enumerate(str2):
                        # Cost of insertions, deletions, or substitutions
                        insertions = previous_row[j + 1] + 1
                        deletions = current_row[j] + 1
                        substitutions = previous_row[j] + (c1 != c2)
                        current_row.append(min(insertions, deletions, substitutions))
                    previous_row = current_row
                
                distance = previous_row[-1]
                max_len = max(len(str1), len(str2))
                return 1.0 - (distance / max_len)
            
            def find_similar_folder(folder_name: str, existing: dict) -> Optional[str]:
                """Find similar folder names to avoid duplicates."""
                normalized = folder_name.lower().strip()
                # Remove common suffixes for matching
                base_name = normalized.replace(' documents', '').replace(' document', '')
                
                best_match = None
                best_similarity = 0.0
                
                for existing_name in existing.keys():
                    existing_base = existing_name.replace(' documents', '').replace(' document', '')
                    
                    # Exact match (case-insensitive)
                    if base_name == existing_base:
                        return existing_name
                    
                    # Calculate similarity
                    similarity = calculate_similarity(base_name, existing_base)
                    
                    # Consider it a match if similarity is 85% or higher
                    # This will catch: vehical/vehicle, registration/registeration, etc.
                    if similarity >= 0.85 and similarity > best_similarity:
                        best_similarity = similarity
                        best_match = existing_name
                
                return best_match
            
            folders_created = []
            documents_organized = 0
            
            # Step 4: Create folders and organize documents
            order_index = len(existing_folders) + 1
            
            for doc_type, docs in documents_by_type.items():
                folder_name = self._format_folder_name(doc_type)
                folder_key = folder_name.lower()
                
                # Check if folder already exists (exact match)
                if folder_key in existing_folders:
                    folder_id = existing_folders[folder_key]['id']
                    logger.info(f"📁 Using existing folder: {folder_name}")
                else:
                    # Check for similar folders (fuzzy match)
                    similar_folder_key = find_similar_folder(folder_name, existing_folders)
                    if similar_folder_key:
                        folder_id = existing_folders[similar_folder_key]['id']
                        logger.info(f"📁 Using similar existing folder '{existing_folders[similar_folder_key]['name']}' for '{folder_name}'")
                    else:
                        # Create new folder
                        color = DOCUMENT_TYPE_COLORS.get(doc_type, DOCUMENT_TYPE_COLORS['other'])
                        icon = DOCUMENT_TYPE_ICONS.get(doc_type, DOCUMENT_TYPE_ICONS['other'])
                        
                        new_folder = {
                            'user_id': user_id,
                            'name': folder_name,
                            'description': f'Documents of type: {folder_name}',
                            'folder_color': color,
                            'icon': icon,
                            'document_count': 0,
                            'filter_rules': {
                                'document_type': [doc_type],
                                'auto_organize': True
                            },
                            'order_index': order_index
                        }
                        
                        folder_response = self.supabase.from_('smart_folders').insert(new_folder).execute()
                        
                        if folder_response.data:
                            folder_id = folder_response.data[0]['id']
                            order_index += 1
                            logger.info(f"✨ Created new folder: {folder_name}")
                            
                            folders_created.append({
                                'folderId': folder_id,
                                'folderName': folder_name,
                                'documentType': doc_type,
                                'documentCount': len(docs),
                                'color': color
                            })
                        else:
                            logger.error(f"Failed to create folder: {folder_name}")
                            continue
                
                # Step 5: Assign documents to folder
                for doc in docs:
                    try:
                        # Check if relationship already exists
                        existing_rel = self.supabase.from_('document_shortcuts').select('id').eq(
                            'document_id', doc['id']
                        ).eq('folder_id', folder_id).execute()
                        
                        if not existing_rel.data:
                            # Create relationship using document_shortcuts table
                            self.supabase.from_('document_shortcuts').insert({
                                'document_id': doc['id'],
                                'folder_id': folder_id,
                                'user_id': user_id,
                                'shortcut_name': None
                            }).execute()
                            documents_organized += 1
                    except Exception as e:
                        logger.warning(f"Error assigning document {doc['id']} to folder: {e}")
                
                # Update folder document count
                try:
                    self.supabase.from_('smart_folders').update({
                        'document_count': len(docs)
                    }).eq('id', folder_id).execute()
                except Exception as e:
                    logger.warning(f"Error updating folder count: {e}")
            
            message = f"Organized {documents_organized} documents into {len(folders_created)} new folders"
            logger.info(f"✅ {message}")
            
            return {
                "success": True,
                "foldersCreated": folders_created,
                "documentsOrganized": documents_organized,
                "message": message
            }
            
        except Exception as e:
            logger.error(f"Error in auto_organize_by_document_type: {str(e)}")
            raise

    def _format_folder_name(self, doc_type: str) -> str:
        """Format document type into a readable folder name."""
        # Convert snake_case or kebab-case to Title Case
        name = doc_type.replace('_', ' ').replace('-', ' ')
        # Capitalize each word
        name = ' '.join(word.capitalize() for word in name.split())
        # Don't add 'Documents' suffix - keep names clean
        return name

    async def process_pending_documents(self, user_id: str, document_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Process pending documents that haven't been analyzed yet.
        Extracts document type and organizes them into folders.
        """
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            logger.info(f"🔄 Processing pending documents for user: {user_id}")
            
            # Get documents without analysis
            query = self.supabase.from_('documents').select(
                'id, file_name, document_type, extracted_text, analysis_result'
            ).eq('user_id', user_id)
            
            if document_ids:
                query = query.in_('id', document_ids)
            
            docs_response = query.execute()
            
            if not docs_response.data:
                return {
                    "success": True,
                    "processedCount": 0,
                    "documents": [],
                    "message": "No pending documents found"
                }
            
            # Filter documents that need processing (no analysis_result or empty {} means not processed)
            pending_docs = [
                doc for doc in docs_response.data
                if not doc.get('analysis_result') or (isinstance(doc.get('analysis_result'), dict) and len(doc.get('analysis_result')) == 0)
            ]
            
            if not pending_docs:
                return {
                    "success": True,
                    "processedCount": 0,
                    "documents": [],
                    "message": "All documents are already processed"
                }
            
            logger.info(f"📋 Found {len(pending_docs)} pending documents")
            
            processed_documents = []
            
            for doc in pending_docs:
                try:
                    # Try to infer document type from filename or extracted text
                    doc_type = self._infer_document_type(doc)
                    
                    # Create basic analysis result to mark document as processed
                    analysis_result = {
                        'processed': True,
                        'document_type': doc_type,
                        'processed_at': datetime.utcnow().isoformat(),
                        'summary': f'Document identified as {doc_type.replace("-", " ").title()}',
                        'key_topics': [doc_type],
                        'importance_score': 0.7,
                        'ai_generated_title': doc.get('file_name', 'Unknown')
                    }
                    
                    # Update document with inferred type and analysis result
                    self.supabase.from_('documents').update({
                        'document_type': doc_type,
                        'analysis_result': analysis_result,
                        'processing_status': 'completed'
                    }).eq('id', doc['id']).execute()
                    
                    processed_documents.append({
                        'documentId': doc['id'],
                        'fileName': doc.get('file_name', 'Unknown'),
                        'documentType': doc_type,
                        'status': 'processed'
                    })
                    
                    logger.info(f"✅ Processed: {doc.get('file_name')} -> {doc_type}")
                    
                except Exception as e:
                    logger.warning(f"Error processing document {doc['id']}: {e}")
                    processed_documents.append({
                        'documentId': doc['id'],
                        'fileName': doc.get('file_name', 'Unknown'),
                        'documentType': 'unknown',
                        'status': 'error'
                    })
            
            return {
                "success": True,
                "processedCount": len([d for d in processed_documents if d['status'] == 'processed']),
                "documents": processed_documents,
                "message": f"Processed {len(processed_documents)} documents"
            }
            
        except Exception as e:
            logger.error(f"Error in process_pending_documents: {str(e)}")
            raise

    def _infer_document_type(self, doc: Dict[str, Any]) -> str:
        """Infer document type from filename and extracted text."""
        filename = (doc.get('file_name') or '').lower()
        text = (doc.get('extracted_text') or '').lower()[:1000]  # First 1000 chars
        
        # Check filename patterns
        type_patterns = {
            'invoice': ['invoice', 'bill', 'billing'],
            'receipt': ['receipt', 'payment'],
            'contract': ['contract', 'agreement'],
            'certificate': ['certificate', 'cert', 'diploma'],
            'identity': ['passport', 'license', 'id card', 'aadhar', 'pan'],
            'medical': ['medical', 'prescription', 'health', 'hospital'],
            'insurance': ['insurance', 'policy', 'claim'],
            'tax': ['tax', 'itr', 'gst', 'tds'],
            'travel': ['ticket', 'booking', 'flight', 'hotel', 'itinerary'],
            'financial': ['bank', 'statement', 'ledger', 'balance'],
            'report': ['report', 'analysis', 'summary'],
            'legal': ['legal', 'court', 'affidavit', 'notary'],
        }
        
        # Check filename first
        for doc_type, patterns in type_patterns.items():
            for pattern in patterns:
                if pattern in filename:
                    return doc_type
        
        # Check extracted text
        for doc_type, patterns in type_patterns.items():
            for pattern in patterns:
                if pattern in text:
                    return doc_type
        
        return 'other'


# Create singleton instance
auto_organize_service = AutoOrganizeService()
