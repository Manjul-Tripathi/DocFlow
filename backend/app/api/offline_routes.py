"""
Offline Mode API Routes
Endpoints for offline document management and sync operations.
"""

import logging
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.offline_schemas import (
    PrepareDownloadRequest,
    PrepareDownloadResponse,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncStatusResponse,
    ConflictResolutionRequest,
    ConflictResolutionResponse,
    MarkOfflineRequest,
    MarkOfflineResponse,
)
from ..services.offline_sync_service import offline_sync_service

logger = logging.getLogger(__name__)

# Create router
offline_router = APIRouter(prefix="/offline", tags=["Offline Mode"])


@offline_router.post("/prepare-download", response_model=PrepareDownloadResponse)
async def prepare_documents_for_download(request: PrepareDownloadRequest):
    """
    Prepare documents for offline download.
    Returns document metadata with signed download URLs.
    """
    try:
        logger.info(f"📥 Prepare download request: {len(request.document_ids)} documents")
        
        documents, total_size = await offline_sync_service.prepare_documents_for_offline(
            request.user_id,
            request.document_ids
        )
        
        return PrepareDownloadResponse(
            success=True,
            documents=documents,
            total_size=total_size,
            message=f"Prepared {len(documents)} documents for offline access"
        )
        
    except Exception as e:
        logger.error(f"Error preparing documents for download: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to prepare documents: {str(e)}"
        )


@offline_router.post("/sync", response_model=SyncBatchResponse)
async def sync_batch_operations(request: SyncBatchRequest):
    """
    Sync batch of offline operations to server.
    Handles create, update, and delete operations.
    Returns sync results including any conflicts.
    """
    try:
        logger.info(f"🔄 Sync request: {len(request.operations)} operations")
        
        synced, conflicts, failed = await offline_sync_service.sync_batch_operations(
            request.user_id,
            request.operations
        )
        
        return SyncBatchResponse(
            success=len(failed) == 0,
            synced=synced,
            conflicts=conflicts,
            failed=failed,
            server_timestamp=datetime.utcnow(),
            message=f"Synced {len(synced)} operations, {len(conflicts)} conflicts, {len(failed)} failed"
        )
        
    except Exception as e:
        logger.error(f"Error syncing operations: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}"
        )


@offline_router.get("/status", response_model=SyncStatusResponse)
async def get_sync_status(user_id: str):
    """
    Get user's offline sync status.
    Returns pending changes, conflicts, and storage usage.
    """
    try:
        logger.info(f"📊 Status request for user: {user_id}")
        
        status = await offline_sync_service.get_sync_status(user_id)
        
        return SyncStatusResponse(**status)
        
    except Exception as e:
        logger.error(f"Error getting sync status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get sync status: {str(e)}"
        )


@offline_router.post("/resolve-conflict", response_model=ConflictResolutionResponse)
async def resolve_sync_conflict(request: ConflictResolutionRequest):
    """
    Resolve a sync conflict for a specific document.
    Supports keep_local, keep_server, and merge strategies.
    """
    try:
        logger.info(f"🔧 Resolve conflict: {request.document_id} -> {request.resolution}")
        
        resolved_data, new_version = await offline_sync_service.resolve_conflict(
            request.user_id,
            request.document_id,
            request.resolution,
            request.merged_data
        )
        
        return ConflictResolutionResponse(
            success=True,
            document_id=request.document_id,
            new_version=new_version,
            resolved_data=resolved_data,
            message=f"Conflict resolved using {request.resolution.value} strategy"
        )
        
    except ValueError as e:
        logger.warning(f"Invalid conflict resolution request: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error resolving conflict: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to resolve conflict: {str(e)}"
        )


@offline_router.post("/mark-offline", response_model=MarkOfflineResponse)
async def mark_document_offline(request: MarkOfflineRequest):
    """
    Mark or unmark a document for offline access.
    This tracks which documents the user has saved offline.
    """
    try:
        action = "marking" if request.offline else "unmarking"
        logger.info(f"📌 {action} document {request.document_id} for offline")
        
        success = await offline_sync_service.mark_document_offline(
            request.user_id,
            request.document_id,
            request.offline
        )
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail="Document not found or access denied"
            )
        
        return MarkOfflineResponse(
            success=True,
            document_id=request.document_id,
            is_offline=request.offline,
            message=f"Document {'marked for' if request.offline else 'removed from'} offline access"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking document offline: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to mark document offline: {str(e)}"
        )


@offline_router.get("/documents/{user_id}")
async def get_offline_documents(user_id: str):
    """
    Get list of documents marked for offline access by user.
    """
    try:
        logger.info(f"📋 Getting offline documents for user: {user_id}")
        
        from ..core.supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        if not supabase:
            raise HTTPException(status_code=500, detail="Database not available")
        
        # Get offline access records with document details
        response = supabase.table('offline_access').select(
            'document_id, downloaded_at, version_downloaded, file_size, '
            'documents(id, file_name, file_type, file_size, updated_at, document_type)'
        ).eq('user_id', user_id).execute()
        
        documents = []
        for record in (response.data or []):
            if record.get('documents'):
                doc = record['documents']
                documents.append({
                    'id': doc['id'],
                    'file_name': doc['file_name'],
                    'file_type': doc['file_type'],
                    'file_size': doc['file_size'],
                    'document_type': doc.get('document_type'),
                    'downloaded_at': record['downloaded_at'],
                    'version_downloaded': record['version_downloaded'],
                    'updated_at': doc['updated_at'],
                    'needs_update': False  # Could compare versions here
                })
        
        return {
            "success": True,
            "documents": documents,
            "count": len(documents)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting offline documents: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get offline documents: {str(e)}"
        )
