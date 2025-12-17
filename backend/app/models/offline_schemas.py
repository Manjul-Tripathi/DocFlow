"""
Offline Mode Schemas
Pydantic models for offline sync operations.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal
from datetime import datetime
from enum import Enum


class SyncOperationType(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class ConflictType(str, Enum):
    VERSION_MISMATCH = "version_mismatch"
    DELETED_ON_SERVER = "deleted_on_server"
    MODIFIED_BOTH = "modified_both"


class ConflictResolutionStrategy(str, Enum):
    KEEP_LOCAL = "keep_local"
    KEEP_SERVER = "keep_server"
    MERGE = "merge"


class SyncStatus(str, Enum):
    SYNCED = "synced"
    PENDING = "pending"
    CONFLICT = "conflict"
    FAILED = "failed"


# ============== Request Models ==============

class PrepareDownloadRequest(BaseModel):
    """Request to prepare documents for offline download."""
    user_id: str
    document_ids: List[str]


class SyncOperation(BaseModel):
    """Single sync operation from client."""
    id: str = Field(..., description="Operation ID (client-generated UUID)")
    type: SyncOperationType
    table: str = Field(..., description="Target table name")
    data: Dict[str, Any]
    local_version: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SyncBatchRequest(BaseModel):
    """Batch of sync operations to process."""
    user_id: str
    operations: List[SyncOperation]
    client_timestamp: datetime = Field(default_factory=datetime.utcnow)


class ConflictResolutionRequest(BaseModel):
    """Request to resolve a specific conflict."""
    user_id: str
    document_id: str
    resolution: ConflictResolutionStrategy
    merged_data: Optional[Dict[str, Any]] = None


class MarkOfflineRequest(BaseModel):
    """Request to mark/unmark documents for offline access."""
    user_id: str
    document_id: str
    offline: bool = True


# ============== Response Models ==============

class OfflineDocumentData(BaseModel):
    """Document data prepared for offline download."""
    id: str
    file_name: str
    file_type: str
    file_size: int
    download_url: Optional[str] = None
    metadata: Dict[str, Any] = {}
    extracted_text: Optional[str] = None
    document_type: Optional[str] = None
    processing_status: str = "completed"
    version: int = 1
    last_modified: datetime
    created_at: datetime


class PrepareDownloadResponse(BaseModel):
    """Response with documents prepared for offline download."""
    success: bool
    documents: List[OfflineDocumentData]
    total_size: int = 0
    message: Optional[str] = None


class SyncConflict(BaseModel):
    """Details of a sync conflict."""
    operation_id: str
    document_id: str
    conflict_type: ConflictType
    local_version: Optional[int] = None
    server_version: int
    local_data: Dict[str, Any]
    server_data: Dict[str, Any]
    server_modified_at: datetime


class SyncBatchResponse(BaseModel):
    """Response for batch sync operation."""
    success: bool
    synced: List[str] = []  # Operation IDs that succeeded
    conflicts: List[SyncConflict] = []
    failed: List[Dict[str, Any]] = []  # Failed operations with error details
    server_timestamp: datetime = Field(default_factory=datetime.utcnow)
    message: Optional[str] = None


class SyncStatusResponse(BaseModel):
    """Response with user's sync status."""
    last_sync: Optional[datetime] = None
    pending_changes: int = 0
    conflicts: int = 0
    offline_documents: int = 0
    storage_used: int = 0  # bytes
    is_syncing: bool = False


class ConflictResolutionResponse(BaseModel):
    """Response after resolving a conflict."""
    success: bool
    document_id: str
    new_version: int
    resolved_data: Dict[str, Any]
    message: Optional[str] = None


class MarkOfflineResponse(BaseModel):
    """Response for mark/unmark offline operation."""
    success: bool
    document_id: str
    is_offline: bool
    message: Optional[str] = None


# ============== Internal Models ==============

class DocumentVersion(BaseModel):
    """Version information for a document."""
    document_id: str
    version: int
    updated_at: datetime
    updated_by: Optional[str] = None
    change_summary: Optional[str] = None


class OfflineAccessRecord(BaseModel):
    """Record of offline access for a document."""
    user_id: str
    document_id: str
    downloaded_at: datetime
    version_downloaded: int
    file_size: int
    last_accessed: Optional[datetime] = None
