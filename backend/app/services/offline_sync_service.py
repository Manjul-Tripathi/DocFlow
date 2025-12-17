"""
Offline Sync Service
Handles offline document management and sync operations.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from ..core.supabase_client import get_supabase_client
from ..models.offline_schemas import (
    SyncOperation,
    SyncOperationType,
    SyncConflict,
    ConflictType,
    ConflictResolutionStrategy,
    OfflineDocumentData,
    DocumentVersion,
)

logger = logging.getLogger(__name__)


class OfflineSyncService:
    """Service for managing offline sync operations."""
    
    def __init__(self):
        self.supabase = get_supabase_client()
    
    async def prepare_documents_for_offline(
        self, 
        user_id: str, 
        document_ids: List[str]
    ) -> Tuple[List[OfflineDocumentData], int]:
        """
        Prepare documents for offline download.
        Returns document data with signed download URLs.
        """
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            logger.info(f"📥 Preparing {len(document_ids)} documents for offline (user: {user_id})")
            
            # Fetch documents
            response = self.supabase.table('documents').select(
                'id, file_name, file_type, file_size, storage_path, metadata, '
                'extracted_text, document_type, processing_status, created_at, updated_at'
            ).eq('user_id', user_id).in_('id', document_ids).eq('is_deleted', False).execute()
            
            if not response.data:
                logger.warning(f"No documents found for offline preparation")
                return [], 0
            
            documents = []
            total_size = 0
            
            for doc in response.data:
                # Generate signed URL for download (valid for 1 hour)
                download_url = None
                if doc.get('storage_path'):
                    try:
                        url_response = self.supabase.storage.from_('documents').create_signed_url(
                            doc['storage_path'],
                            3600  # 1 hour
                        )
                        if isinstance(url_response, dict):
                            download_url = url_response.get('signedURL') or url_response.get('signedUrl')
                    except Exception as e:
                        logger.warning(f"Could not generate download URL for {doc['id']}: {e}")
                
                # Get document version (use updated_at timestamp as version proxy)
                version = self._get_document_version(doc['id'])
                
                offline_doc = OfflineDocumentData(
                    id=doc['id'],
                    file_name=doc['file_name'],
                    file_type=doc['file_type'],
                    file_size=doc.get('file_size', 0),
                    download_url=download_url,
                    metadata=doc.get('metadata', {}),
                    extracted_text=doc.get('extracted_text'),
                    document_type=doc.get('document_type'),
                    processing_status=doc.get('processing_status', 'completed'),
                    version=version,
                    last_modified=datetime.fromisoformat(doc['updated_at'].replace('Z', '+00:00')),
                    created_at=datetime.fromisoformat(doc['created_at'].replace('Z', '+00:00')),
                )
                
                documents.append(offline_doc)
                total_size += doc.get('file_size', 0)
            
            # Record offline access
            await self._record_offline_access(user_id, document_ids)
            
            logger.info(f"✅ Prepared {len(documents)} documents ({total_size} bytes)")
            return documents, total_size
            
        except Exception as e:
            logger.error(f"Error preparing documents for offline: {e}")
            raise
    
    async def sync_batch_operations(
        self,
        user_id: str,
        operations: List[SyncOperation]
    ) -> Tuple[List[str], List[SyncConflict], List[Dict[str, Any]]]:
        """
        Process batch of sync operations.
        Returns (synced_ids, conflicts, failed_operations).
        """
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        synced = []
        conflicts = []
        failed = []
        
        logger.info(f"🔄 Processing {len(operations)} sync operations for user: {user_id}")
        
        for op in operations:
            try:
                # Check for conflicts
                conflict = await self._detect_conflict(user_id, op)
                
                if conflict:
                    conflicts.append(conflict)
                    logger.warning(f"⚠️ Conflict detected for operation {op.id}")
                    continue
                
                # Apply operation
                success = await self._apply_operation(user_id, op)
                
                if success:
                    synced.append(op.id)
                    logger.info(f"✅ Synced operation {op.id}")
                else:
                    failed.append({
                        "operation_id": op.id,
                        "error": "Failed to apply operation"
                    })
                    
            except Exception as e:
                logger.error(f"Error processing operation {op.id}: {e}")
                failed.append({
                    "operation_id": op.id,
                    "error": str(e)
                })
        
        logger.info(f"📊 Sync complete: {len(synced)} synced, {len(conflicts)} conflicts, {len(failed)} failed")
        return synced, conflicts, failed
    
    async def resolve_conflict(
        self,
        user_id: str,
        document_id: str,
        resolution: ConflictResolutionStrategy,
        merged_data: Optional[Dict[str, Any]] = None
    ) -> Tuple[Dict[str, Any], int]:
        """
        Resolve a sync conflict for a document.
        Returns (resolved_data, new_version).
        """
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        logger.info(f"🔧 Resolving conflict for document {document_id} with strategy: {resolution}")
        
        # Get current server version
        response = self.supabase.table('documents').select('*').eq('id', document_id).eq('user_id', user_id).single().execute()
        
        if not response.data:
            raise ValueError(f"Document {document_id} not found")
        
        server_doc = response.data
        
        if resolution == ConflictResolutionStrategy.KEEP_SERVER:
            # Keep server version - just return current data
            return server_doc, self._get_document_version(document_id)
        
        elif resolution == ConflictResolutionStrategy.KEEP_LOCAL:
            # Apply local version
            if not merged_data:
                raise ValueError("merged_data required for keep_local resolution")
            
            # Update with local data
            update_data = {
                k: v for k, v in merged_data.items() 
                if k not in ['id', 'user_id', 'created_at']
            }
            update_data['updated_at'] = datetime.utcnow().isoformat()
            
            self.supabase.table('documents').update(update_data).eq('id', document_id).execute()
            
            # Increment version
            new_version = self._increment_version(document_id)
            
            return {**server_doc, **update_data}, new_version
        
        elif resolution == ConflictResolutionStrategy.MERGE:
            # Merge both versions
            if not merged_data:
                raise ValueError("merged_data required for merge resolution")
            
            # Smart merge - combine metadata, tags, etc.
            merged = self._smart_merge(server_doc, merged_data)
            merged['updated_at'] = datetime.utcnow().isoformat()
            
            self.supabase.table('documents').update(merged).eq('id', document_id).execute()
            
            new_version = self._increment_version(document_id)
            
            return merged, new_version
        
        else:
            raise ValueError(f"Unknown resolution strategy: {resolution}")
    
    async def get_sync_status(self, user_id: str) -> Dict[str, Any]:
        """Get user's offline sync status."""
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            # Get offline access records
            offline_response = self.supabase.table('offline_access').select(
                'document_id, file_size'
            ).eq('user_id', user_id).execute()
            
            offline_docs = offline_response.data or []
            storage_used = sum(doc.get('file_size', 0) for doc in offline_docs)
            
            # Get last sync time from user metadata or default
            last_sync = None
            
            return {
                "last_sync": last_sync,
                "pending_changes": 0,  # Client tracks this
                "conflicts": 0,        # Client tracks this
                "offline_documents": len(offline_docs),
                "storage_used": storage_used,
                "is_syncing": False
            }
            
        except Exception as e:
            logger.error(f"Error getting sync status: {e}")
            return {
                "last_sync": None,
                "pending_changes": 0,
                "conflicts": 0,
                "offline_documents": 0,
                "storage_used": 0,
                "is_syncing": False
            }
    
    async def mark_document_offline(
        self, 
        user_id: str, 
        document_id: str, 
        offline: bool
    ) -> bool:
        """Mark or unmark a document for offline access."""
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            if offline:
                # Get document info
                doc_response = self.supabase.table('documents').select(
                    'id, file_size'
                ).eq('id', document_id).eq('user_id', user_id).single().execute()
                
                if not doc_response.data:
                    return False
                
                # Upsert offline access record
                self.supabase.table('offline_access').upsert({
                    'user_id': user_id,
                    'document_id': document_id,
                    'file_size': doc_response.data.get('file_size', 0),
                    'downloaded_at': datetime.utcnow().isoformat(),
                    'version_downloaded': self._get_document_version(document_id)
                }).execute()
                
                logger.info(f"📥 Marked document {document_id} for offline access")
            else:
                # Remove offline access record
                self.supabase.table('offline_access').delete().eq(
                    'user_id', user_id
                ).eq('document_id', document_id).execute()
                
                logger.info(f"📤 Removed document {document_id} from offline access")
            
            return True
            
        except Exception as e:
            logger.error(f"Error marking document offline: {e}")
            return False
    
    # ============== Private Methods ==============
    
    def _get_document_version(self, document_id: str) -> int:
        """Get version number for a document."""
        try:
            response = self.supabase.table('document_versions').select(
                'version'
            ).eq('document_id', document_id).order('version', desc=True).limit(1).execute()
            
            if response.data:
                return response.data[0]['version']
            return 1
        except:
            # If no version tracking table, use 1
            return 1
    
    def _increment_version(self, document_id: str) -> int:
        """Increment and return new version number."""
        current = self._get_document_version(document_id)
        new_version = current + 1
        
        try:
            self.supabase.table('document_versions').insert({
                'document_id': document_id,
                'version': new_version,
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
        except:
            pass  # Version table may not exist
        
        return new_version
    
    async def _detect_conflict(
        self, 
        user_id: str, 
        operation: SyncOperation
    ) -> Optional[SyncConflict]:
        """Detect if an operation would cause a conflict."""
        if operation.type == SyncOperationType.CREATE:
            return None  # New documents can't conflict
        
        document_id = operation.data.get('id')
        if not document_id:
            return None
        
        # Get server document
        response = self.supabase.table('documents').select('*').eq('id', document_id).eq('user_id', user_id).single().execute()
        
        if not response.data:
            if operation.type == SyncOperationType.UPDATE:
                # Document deleted on server
                return SyncConflict(
                    operation_id=operation.id,
                    document_id=document_id,
                    conflict_type=ConflictType.DELETED_ON_SERVER,
                    local_version=operation.local_version,
                    server_version=0,
                    local_data=operation.data,
                    server_data={},
                    server_modified_at=datetime.utcnow()
                )
            return None
        
        server_doc = response.data
        server_version = self._get_document_version(document_id)
        
        # Check version mismatch
        if operation.local_version and operation.local_version < server_version:
            return SyncConflict(
                operation_id=operation.id,
                document_id=document_id,
                conflict_type=ConflictType.VERSION_MISMATCH,
                local_version=operation.local_version,
                server_version=server_version,
                local_data=operation.data,
                server_data=server_doc,
                server_modified_at=datetime.fromisoformat(
                    server_doc['updated_at'].replace('Z', '+00:00')
                )
            )
        
        return None
    
    async def _apply_operation(
        self, 
        user_id: str, 
        operation: SyncOperation
    ) -> bool:
        """Apply a sync operation to the database."""
        try:
            if operation.type == SyncOperationType.CREATE:
                data = {**operation.data, 'user_id': user_id}
                self.supabase.table(operation.table).insert(data).execute()
                
            elif operation.type == SyncOperationType.UPDATE:
                document_id = operation.data.get('id')
                update_data = {
                    k: v for k, v in operation.data.items() 
                    if k not in ['id', 'user_id', 'created_at']
                }
                update_data['updated_at'] = datetime.utcnow().isoformat()
                
                self.supabase.table(operation.table).update(update_data).eq(
                    'id', document_id
                ).eq('user_id', user_id).execute()
                
                self._increment_version(document_id)
                
            elif operation.type == SyncOperationType.DELETE:
                document_id = operation.data.get('id')
                # Soft delete
                self.supabase.table(operation.table).update({
                    'is_deleted': True,
                    'deleted_at': datetime.utcnow().isoformat()
                }).eq('id', document_id).eq('user_id', user_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error applying operation: {e}")
            return False
    
    async def _record_offline_access(
        self, 
        user_id: str, 
        document_ids: List[str]
    ) -> None:
        """Record that documents were downloaded for offline access."""
        try:
            # Get document sizes
            response = self.supabase.table('documents').select(
                'id, file_size'
            ).in_('id', document_ids).execute()
            
            records = []
            for doc in (response.data or []):
                records.append({
                    'user_id': user_id,
                    'document_id': doc['id'],
                    'file_size': doc.get('file_size', 0),
                    'downloaded_at': datetime.utcnow().isoformat(),
                    'version_downloaded': self._get_document_version(doc['id'])
                })
            
            if records:
                self.supabase.table('offline_access').upsert(records).execute()
                
        except Exception as e:
            # Non-critical, just log
            logger.warning(f"Could not record offline access: {e}")
    
    def _smart_merge(
        self, 
        server_data: Dict[str, Any], 
        local_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Smart merge of server and local document data."""
        merged = dict(server_data)
        
        # Fields that can be safely merged (arrays)
        array_fields = ['tags', 'folders']
        
        for field in array_fields:
            if field in local_data and field in server_data:
                # Combine arrays, remove duplicates
                server_items = server_data.get(field, []) or []
                local_items = local_data.get(field, []) or []
                merged[field] = list(set(server_items + local_items))
        
        # Fields where local takes precedence (user-edited)
        local_priority_fields = ['metadata', 'notes', 'custom_name']
        
        for field in local_priority_fields:
            if field in local_data:
                merged[field] = local_data[field]
        
        return merged


# Singleton instance
offline_sync_service = OfflineSyncService()
