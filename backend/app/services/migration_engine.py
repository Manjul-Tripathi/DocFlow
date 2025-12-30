"""
Migration Engine - ULTRA FAST VERSION
Uses async HTTP for downloads, minimal DB calls, and better parallelism
With transfer time tracking and status updates
"""
import asyncio
from typing import Optional, Dict, Any, List
import logging
from datetime import datetime
import time
import aiohttp
import os

from ..core.supabase_client import get_supabase_client
from ..core.supabase_client import get_supabase_client
from .google_drive_connector import GoogleDriveConnector
from .onedrive_connector import OneDriveConnector

logger = logging.getLogger(__name__)


class MigrationEngine:
    """
    ULTRA FAST Migration Engine with timing.
    - Async HTTP for Google Drive downloads (no blocking)
    - Higher concurrency (10 workers by default)
    - Minimal database operations
    - Transfer time tracking
    """
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.supabase = get_supabase_client()
        self.connector: Optional[Any] = None  # Generic connector
        self.concurrency = 10  # Higher default
        self.processed_count = 0
        self.failed_count = 0
        self.total_bytes = 0
        self.start_time: Optional[float] = None
        self.access_token: Optional[str] = None
        self.source_system: str = 'google_drive'
        # Metrics tracking
        self.last_metrics_time: float = 0
        self.metrics_interval: float = 5.0  # Record metrics every 5 seconds
        self.throttle_count: int = 0
        
    async def start_migration(self):
        """Start ultra-fast migration with timing."""
        self.start_time = time.time()
        
        try:
            logger.info(f"🚀 Starting ULTRA-FAST migration: {self.job_id}")
            self._update_job_status('discovering')
            self._record_audit_log('job_started', metadata={'source_system': self.source_system})
            
            job = self._get_job()
            self.concurrency = job.get('config', {}).get('concurrency', 10)
            
            # Initialize connector and get access token
            self._initialize_connector(job)
            
            # Fast discovery with batch insert
            discover_start = time.time()
            items_count = self._discover_files_fast(job)
            discover_time = time.time() - discover_start
            logger.info(f"⏱️ Discovery: {discover_time:.2f}s ({items_count} files)")
            
            if items_count == 0:
                self._update_job_status('completed', completed_at=datetime.utcnow().isoformat())
                return
            
            self._update_job_status('running', started_at=datetime.utcnow().isoformat())
            
            # ULTRA-FAST parallel transfer with async HTTP
            transfer_start = time.time()
            await self._transfer_files_ultra_fast()
            transfer_time = time.time() - transfer_start
            
            # Calculate final stats
            total_time = time.time() - self.start_time
            speed = (self.total_bytes / 1024 / 1024) / transfer_time if transfer_time > 0 else 0
            
            logger.info(f"")
            logger.info(f"{'='*50}")
            logger.info(f"✅ MIGRATION COMPLETE")
            logger.info(f"{'='*50}")
            logger.info(f"📊 Files: {self.processed_count} succeeded, {self.failed_count} failed")
            logger.info(f"📦 Size: {self.total_bytes / 1024:.1f} KB")
            logger.info(f"⏱️ Transfer: {transfer_time:.2f}s")
            logger.info(f"⏱️ Total: {total_time:.2f}s")
            logger.info(f"🚀 Speed: {speed:.2f} MB/s")
            logger.info(f"{'='*50}")
            
            # Update with timing info
            self._update_job_status(
                'completed',
                completed_at=datetime.utcnow().isoformat(),
                processed_items=self.processed_count,
                failed_items=self.failed_count,
                transferred_bytes=self.total_bytes,
                config={
                    'transfer_time_seconds': round(transfer_time, 2),
                    'total_time_seconds': round(total_time, 2),
                    'speed_mbps': round(speed, 2)
                }
            )
            
            # Record final metrics snapshot with accurate stage counts
            self._record_metrics()
            
            self._record_audit_log('job_completed', metadata={
                'processed': self.processed_count,
                'failed': self.failed_count,
                'total_bytes': self.total_bytes,
                'speed_mbps': round(speed, 2)
            })
            
        except Exception as e:
            import traceback
            logger.error(f"❌ Migration failed: {e}\n{traceback.format_exc()}")
            self._update_job_status('failed')
            raise
    
    def _get_job(self) -> Dict[str, Any]:
        return self.supabase.table('migration_jobs').select('*').eq('id', self.job_id).single().execute().data
    
    def _initialize_connector(self, job: Dict[str, Any]):
        import json
        from google.auth.transport.requests import Request
        
        # Get source_system from job
        self.source_system = job.get('source_system', 'google_drive')
        
        cred_id = job.get('source_credentials_id')
        if cred_id:
            cred = self.supabase.table('migration_credentials').select('*').eq('id', cred_id).single().execute()
            cred_data = cred.data['credentials_encrypted']
            self.source_system = cred.data.get('source_system', self.source_system)
            
            if self.source_system == 'onedrive':
                self.connector = OneDriveConnector(cred_data)
                self.access_token = cred_data.get('access_token')
                logger.info(f"✅ Using OneDrive credentials from database")
            else:
                self.connector = GoogleDriveConnector(cred_data)
                self.access_token = cred_data.get('access_token') or self.connector.creds.token
                logger.info(f"✅ Using Google Drive credentials from database")
            return
        
        # Check for access_token in job config (Quick Connect mode)
        config_access_token = job.get('config', {}).get('access_token')
        if config_access_token:
            if self.source_system == 'onedrive':
                self.connector = OneDriveConnector({'access_token': config_access_token})
                self.access_token = config_access_token
                logger.info(f"✅ Using OneDrive Quick Connect token")
            else:
                self.connector = GoogleDriveConnector({'access_token': config_access_token})
                self.access_token = config_access_token
                logger.info(f"✅ Using Google Drive Quick Connect token")
            return

        # Fallback to Google Drive service account (only for Google Drive)
        if self.source_system == 'google_drive':
            service_account_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                'google-service-account.json'
            )
            
            if os.path.exists(service_account_path):
                try:
                    with open(service_account_path, 'r') as f:
                        sa_data = json.load(f)
                    self.connector = GoogleDriveConnector(sa_data)
                    
                    # IMPORTANT: Refresh service account credentials to get valid access token
                    if not self.connector.creds.token:
                        self.connector.creds.refresh(Request())
                    
                    self.access_token = self.connector.creds.token
                    logger.info(f"✅ Using service account (token: {self.access_token[:20] if self.access_token else 'None'}...)")
                    return
                except Exception as e:
                    logger.warning(f"Service account failed: {e}")
        
        # No valid connector could be initialized
        raise ValueError(f"No valid credentials for {self.source_system} migration. Please connect your account.")
    
    def _discover_files_fast(self, job: Dict[str, Any]) -> int:
        folder_id = job['config'].get('folder_id') or job['config'].get('source_folder_id')
        logger.info(f"🔍 Discovering in: {folder_id or 'root'}")
        
        all_files = []
        page_token = None
        
        while True:
            result = self.connector.list_files(folder_id, page_token)
            all_files.extend(result['files'])
            if not result['hasMore']:
                break
            page_token = result['nextPageToken']
        
        files_only = [f for f in all_files if f['mimeType'] != 'application/vnd.google-apps.folder']
        
        if not files_only:
            return 0
        
        # Single batch insert
        total_size = 0
        items = []
        for file in files_only:
            items.append({
                'job_id': self.job_id,
                'source_item_id': file['id'],
                'source_name': file['name'],
                'source_path': file.get('webViewLink', ''),
                'source_mime_type': file['mimeType'],
                'source_size': int(file.get('size', 0)),
                'item_type': 'file',
                'status': 'pending'
            })
            total_size += int(file.get('size', 0))
        
        # Batch insert all at once
        self.supabase.table('migration_items').insert(items).execute()
        
        self.supabase.table('migration_jobs').update({
            'total_items': len(files_only),
            'total_bytes': total_size
        }).eq('id', self.job_id).execute()
        
        return len(files_only)
    
    async def _transfer_files_ultra_fast(self):
        """Transfer files with async HTTP - much faster than sync."""
        items = self.supabase.table('migration_items').select('*').eq('job_id', self.job_id).eq('status', 'pending').execute().data
        
        if not items:
            return
        
        job = self._get_job()
        user_id = job['user_id']
        
        logger.info(f"📦 Transferring {len(items)} files with {self.concurrency} async workers")
        
        # Use aiohttp for async downloads
        connector = aiohttp.TCPConnector(limit=self.concurrency, ssl=False)
        timeout = aiohttp.ClientTimeout(total=120)
        
        async with aiohttp.ClientSession(connector=connector, timeout=timeout, trust_env=False) as session:
            semaphore = asyncio.Semaphore(self.concurrency)
            
            async def transfer_one(item):
                async with semaphore:
                    await self._transfer_single_async(session, item, user_id)
            
            tasks = [transfer_one(item) for item in items]
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _transfer_single_async(self, session: aiohttp.ClientSession, item: Dict[str, Any], user_id: str):
        """Transfer a single file using async HTTP."""
        file_id = item['source_item_id']
        file_name = item['source_name']
        file_start = time.time()
        
        try:
            # Async download
            if self.source_system == 'onedrive':
                url = f"https://graph.microsoft.com/v1.0/me/drive/items/{file_id}/content"
                headers = {"Authorization": f"Bearer {self.access_token}"}
            else:
                # Google Drive
                url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
                headers = {"Authorization": f"Bearer {self.access_token}"}
            
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    raise Exception(f"Download failed: HTTP {response.status}")
                file_content = await response.read()
            
            download_time = time.time() - file_start
            
            # Upload to Supabase storage
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            storage_path = f"{user_id}/{timestamp}_{file_name}"
            
            upload_start = time.time()
            self.supabase.storage.from_('documents').upload(
                storage_path,
                file_content,
                {'content-type': item['source_mime_type']}
            )
            upload_time = time.time() - upload_start
            
            # Create document + update item in minimal DB calls
            doc_response = self.supabase.table('documents').insert({
                'user_id': user_id,
                'file_name': file_name,
                'file_type': item['source_mime_type'],
                'file_size': len(file_content),
                'storage_path': storage_path,
                'processing_status': 'completed',
                'metadata': {
                    'migrated_from': self.source_system,
                    'source_id': file_id,
                    'migration_job_id': self.job_id
                }
            }).execute()
            
            self.supabase.table('migration_items').update({
                'status': 'completed',
                'target_document_id': doc_response.data[0]['id']
            }).eq('id', item['id']).execute()
            
            total_time = time.time() - file_start
            self.processed_count += 1
            self.total_bytes += len(file_content)
            
            # Record live metrics periodically
            self._maybe_record_metrics()
            
            size_kb = len(file_content) / 1024
            logger.info(f"✅ [{self.processed_count}] {file_name} ({size_kb:.1f}KB) - {total_time:.2f}s (⬇️{download_time:.2f}s ⬆️{upload_time:.2f}s)")
            
        except Exception as e:
            self.failed_count += 1
            logger.error(f"❌ {file_name}: {str(e)[:100]}")
            
            self.supabase.table('migration_items').update({
                'status': 'failed',
                'last_error': str(e)[:500]
            }).eq('id', item['id']).execute()
            
            # Record failure in audit log
            self._record_audit_log('item_failed', source_item_id=file_id, error_message=str(e)[:200])
    
    def _update_job_status(self, status: str, **kwargs):
        """Update job status with logging."""
        try:
            update_data = {'status': status, **kwargs}
            logger.info(f"📊 Updating job status to: {status}")
            
            result = self.supabase.table('migration_jobs').update(update_data).eq('id', self.job_id).execute()
            
            logger.info(f"✅ Job status updated to: {status}")
            return result
        except Exception as e:
            logger.error(f"❌ Failed to update job status to {status}: {e}")
            raise
    
    def _maybe_record_metrics(self):
        """Record metrics if enough time has passed since last recording."""
        current_time = time.time()
        if current_time - self.last_metrics_time >= self.metrics_interval:
            self._record_metrics()
            self.last_metrics_time = current_time
    
    def _record_metrics(self):
        """Record live performance metrics to database for frontend display."""
        try:
            if not self.start_time:
                return
            
            elapsed_seconds = time.time() - self.start_time
            
            if elapsed_seconds > 0:
                files_per_minute = (self.processed_count / elapsed_seconds) * 60
                bytes_per_second = self.total_bytes / elapsed_seconds
            else:
                files_per_minute = 0
                bytes_per_second = 0
            
            # Get current stage counts from items
            try:
                stage_counts_response = self.supabase.table('migration_items').select('status').eq('job_id', self.job_id).execute()
                stage_counts = {}
                for item in stage_counts_response.data:
                    status = item['status']
                    stage_counts[status] = stage_counts.get(status, 0) + 1
            except Exception:
                stage_counts = {}
            
            metrics_data = {
                'job_id': self.job_id,
                'files_per_minute': round(files_per_minute, 2),
                'bytes_per_second': round(bytes_per_second, 2),
                'error_count': self.failed_count,
                'api_throttle_count': self.throttle_count,
                'stage_counts': stage_counts,
                'recorded_at': datetime.utcnow().isoformat()
            }
            
            self.supabase.table('migration_metrics').insert(metrics_data).execute()
            logger.info(f"📊 Metrics: {files_per_minute:.1f} files/min, {bytes_per_second/1024:.1f} KB/s, {self.processed_count} done")
            
            # Also update job processed counts for real-time progress
            self.supabase.table('migration_jobs').update({
                'processed_items': self.processed_count,
                'failed_items': self.failed_count,
                'transferred_bytes': self.total_bytes
            }).eq('id', self.job_id).execute()
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to record metrics: {e}")
    
    def _record_audit_log(self, event_type: str, source_item_id: str = None, error_message: str = None, error_code: str = None, metadata: dict = None):
        """Record an event to the migration audit log for Activity Log display."""
        try:
            log_data = {
                'job_id': self.job_id,
                'event_type': event_type,
                'source_item_id': source_item_id,
                'error_message': error_message,
                'error_code': error_code,
                'metadata': metadata or {},
                'created_at': datetime.utcnow().isoformat()
            }
            
            self.supabase.table('migration_audit_log').insert(log_data).execute()
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to record audit log: {e}")


async def start_migration_job(job_id: str):
    """Start a migration job."""
    engine = MigrationEngine(job_id)
    await engine.start_migration()
