"""
Migration API - Google Drive to SimplifyDrive migration endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from ..core.supabase_client import get_supabase_client
from ..core.supabase_client import get_supabase_client
from ..services.google_drive_connector import GoogleDriveConnector
from ..services.onedrive_connector import OneDriveConnector

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/migration", tags=["migration"])


# ============================================================================
# Request/Response Models
# ============================================================================

class CredentialCreate(BaseModel):
    name: str
    source_system: str = "google_drive"
    credentials: Dict[str, Any]  # OAuth tokens


class CredentialResponse(BaseModel):
    id: str
    name: str
    source_system: str
    is_valid: bool
    created_at: str


class JobCreate(BaseModel):
    name: str
    source_system: str = "google_drive"  # 'google_drive' or 'onedrive'
    credentials_id: Optional[str] = None  # Optional - can use service account
    folder_id: Optional[str] = None  # Google Drive folder ID
    config: Dict[str, Any] = {}


class JobResponse(BaseModel):
    id: str
    name: str
    source_system: str
    status: str
    total_items: int
    processed_items: int
    failed_items: int
    progress_percent: float
    created_at: str


class DiscoveryRequest(BaseModel):
    credentials_id: str
    folder_id: Optional[str] = None


class DiscoveryResponse(BaseModel):
    total_files: int
    total_folders: int
    total_size_bytes: int
    files: List[Dict[str, Any]]


# ============================================================================
# Credentials Endpoints
# ============================================================================

@router.post("/credentials", response_model=CredentialResponse)
async def create_credentials(credential: CredentialCreate, user_id: str):
    """
    Save Google Drive OAuth credentials for a user.
    
    Args:
        credential: OAuth tokens from Google
        user_id: Current user ID
    """
    try:
        supabase = get_supabase_client()
        
        # Test credentials validity
        try:
            if credential.source_system == 'onedrive':
                connector = OneDriveConnector(credential.credentials)
                logger.info("✅ OneDrive credentials validated")
            else:
                connector = GoogleDriveConnector(credential.credentials)
                logger.info("✅ Google Drive credentials validated")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid credentials: {str(e)}")
        
        # Store encrypted credentials
        response = supabase.table('migration_credentials').insert({
            'user_id': user_id,
            'name': credential.name,
            'source_system': credential.source_system,
            'credentials_encrypted': credential.credentials,
            'is_valid': True,
            'last_validated_at': datetime.utcnow().isoformat()
        }).execute()
        
        cred_data = response.data[0]
        
        return CredentialResponse(
            id=cred_data['id'],
            name=cred_data['name'],
            source_system=cred_data['source_system'],
            is_valid=cred_data['is_valid'],
            created_at=cred_data['created_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating credentials: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credentials", response_model=List[CredentialResponse])
async def get_credentials(user_id: str):
    """Get all saved credentials for user."""
    try:
        supabase = get_supabase_client()
        
        response = supabase.table('migration_credentials').select('*').eq('user_id', user_id).execute()
        
        return [
            CredentialResponse(
                id=cred['id'],
                name=cred['name'],
                source_system=cred['source_system'],
                is_valid=cred['is_valid'],
                created_at=cred['created_at']
            )
            for cred in response.data
        ]
        
    except Exception as e:
        logger.error(f"Error fetching credentials: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Discovery Endpoint
# ============================================================================

@router.post("/discover", response_model=DiscoveryResponse)
async def discover_files(request: DiscoveryRequest, user_id: str):
    """
    Discover files in Google Drive folder.
    
    Args:
        request: Discovery request with credentials and folder ID
        user_id: Current user ID
    """
    try:
        supabase = get_supabase_client()
        
        # Get credentials
        cred_response = supabase.table('migration_credentials').select('*').eq('id', request.credentials_id).eq('user_id', user_id).single().execute()
        
        if not cred_response.data:
            raise HTTPException(status_code=404, detail="Credentials not found")
        
        cred_data = cred_response.data
        source_system = cred_data.get('source_system', 'google_drive')
        
        # Initialize connector
        if source_system == 'onedrive':
            connector = OneDriveConnector(cred_data['credentials_encrypted'])
        else:
            connector = GoogleDriveConnector(cred_data['credentials_encrypted'])
        
        # Discover files
        all_files = []
        page_token = None
        
        while True:
            result = connector.list_files(request.folder_id, page_token)
            all_files.extend(result['files'])
            
            if not result['hasMore']:
                break
            page_token = result['nextPageToken']
        
        # Calculate stats
        total_files = sum(1 for f in all_files if f['mimeType'] != 'application/vnd.google-apps.folder')
        total_folders = sum(1 for f in all_files if f['mimeType'] == 'application/vnd.google-apps.folder')
        total_size = sum(int(f.get('size', 0)) for f in all_files if 'size' in f)
        
        logger.info(f"📂 Discovered {total_files} files, {total_folders} folders ({total_size} bytes)")
        
        return DiscoveryResponse(
            total_files=total_files,
            total_folders=total_folders,
            total_size_bytes=total_size,
            files=all_files[:100]  # Return first 100 for preview
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error discovering files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Job Endpoints
# ============================================================================

@router.post("/jobs", response_model=JobResponse)
async def create_job(job: JobCreate, user_id: str):
    """
    Create a new migration job.
    
    Args:
        job: Job creation request
        user_id: Current user ID
    """
    try:
        supabase = get_supabase_client()
        
        # Handle empty credentials_id (use None instead of empty string)
        cred_id = job.credentials_id if job.credentials_id else None
        
        # Use source_system from request, or from credentials if available
        source_system = job.source_system
        if cred_id:
            cred_response = supabase.table('migration_credentials').select('source_system').eq('id', cred_id).single().execute()
            if cred_response.data:
                source_system = cred_response.data['source_system']
        
        # Create job
        response = supabase.table('migration_jobs').insert({
            'user_id': user_id,
            'name': job.name,
            'source_system': source_system,
            'status': 'pending',
            'config': {
                'folder_id': job.folder_id or None,
                **job.config
            },
            'source_credentials_id': cred_id
        }).execute()
        
        job_data = response.data[0]
        
        logger.info(f"✅ Created migration job: {job_data['id']}")
        
        return JobResponse(
            id=job_data['id'],
            name=job_data['name'],
            source_system=job_data['source_system'],
            status=job_data['status'],
            total_items=job_data['total_items'],
            processed_items=job_data['processed_items'],
            failed_items=job_data['failed_items'],
            progress_percent=0.0,
            created_at=job_data['created_at']
        )
        
    except Exception as e:
        logger.error(f"Error creating job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs", response_model=List[JobResponse])
async def get_jobs(user_id: str):
    """Get all migration jobs for user."""
    try:
        supabase = get_supabase_client()
        
        response = supabase.table('migration_jobs').select('*').eq('user_id', user_id).order('created_at', desc=True).execute()
        
        jobs = []
        for job_data in response.data:
            progress = 0.0
            if job_data['total_items'] > 0:
                progress = (job_data['processed_items'] / job_data['total_items']) * 100
            
            jobs.append(JobResponse(
                id=job_data['id'],
                name=job_data['name'],
                source_system=job_data.get('source_system', 'google_drive'),
                status=job_data['status'],
                total_items=job_data['total_items'],
                processed_items=job_data['processed_items'],
                failed_items=job_data['failed_items'],
                progress_percent=round(progress, 1),
                created_at=job_data['created_at']
            ))
        
        return jobs
        
    except Exception as e:
        logger.error(f"Error fetching jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user_id: str):
    """Get specific migration job."""
    try:
        supabase = get_supabase_client()
        
        response = supabase.table('migration_jobs').select('*').eq('id', job_id).eq('user_id', user_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Job not found")
        
        job_data = response.data
        progress = 0.0
        if job_data['total_items'] > 0:
            progress = (job_data['processed_items'] / job_data['total_items']) * 100
        
        return JobResponse(
            id=job_data['id'],
            name=job_data['name'],
            source_system=job_data.get('source_system', 'google_drive'),
            status=job_data['status'],
            total_items=job_data['total_items'],
            processed_items=job_data['processed_items'],
            failed_items=job_data['failed_items'],
            progress_percent=round(progress, 1),
            created_at=job_data['created_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Job Control Endpoints
# ============================================================================

@router.post("/jobs/{job_id}/start")
async def start_job(job_id: str, user_id: str):
    """
    Start a migration job - triggers the file transfer process.
    
    Args:
        job_id: Migration job UUID
        user_id: Current user ID
    """
    try:
        import asyncio
        from ..services.migration_engine import start_migration_job
        
        supabase = get_supabase_client()
        
        # Verify job exists and belongs to user
        response = supabase.table('migration_jobs').select('*').eq('id', job_id).eq('user_id', user_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Start migration in background
        asyncio.create_task(start_migration_job(job_id))
        
        logger.info(f"🚀 Started migration job: {job_id}")
        
        return {"success": True, "message": "Migration started", "job_id": job_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting job: {e}")
        raise HTTPException(status_code=500, detail=str(e))
