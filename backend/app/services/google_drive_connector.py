"""
Google Drive Connector for Migration Module
Handles OAuth authentication and file operations with Google Drive API
With SSL/Proxy fixes for corporate networks
"""
from typing import Dict, List, Optional, Any
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import httplib2
import io
import logging
import os
import ssl
import requests

logger = logging.getLogger(__name__)


def create_http_with_ssl_fix():
    """Create an httplib2.Http object with SSL fixes for proxy issues."""
    # Disable proxy for Google APIs
    http = httplib2.Http(disable_ssl_certificate_validation=False)
    return http


class GoogleDriveConnector:
    """
    Connector for Google Drive API operations.
    Handles authentication, file discovery, and downloads.
    With SSL/Proxy fixes for corporate networks.
    """
    
    def __init__(self, credentials_dict: Dict[str, Any]):
        """
        Initialize Google Drive connector with OAuth credentials or service account.
        
        Args:
            credentials_dict: Dictionary containing OAuth tokens OR service account info
        """
        # Clear proxy environment for this process (common fix)
        for proxy_var in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
            if proxy_var in os.environ:
                logger.info(f"⚠️ Clearing proxy env: {proxy_var}")
                del os.environ[proxy_var]
        
        # Check if it's a service account (has 'type' field)
        if credentials_dict.get('type') == 'service_account':
            logger.info("🔑 Using Service Account authentication")
            # Use service account
            self.creds = service_account.Credentials.from_service_account_info(
                credentials_dict,
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
        elif credentials_dict.get('access_token'):
            # Simple OAuth flow - just access token (from implicit flow)
            logger.info("🔑 Using access token authentication (implicit OAuth)")
            self.creds = Credentials(
                token=credentials_dict.get('access_token'),
                scopes=credentials_dict.get('scopes', ['https://www.googleapis.com/auth/drive.readonly'])
            )
        else:
            logger.info("🔑 Using OAuth authentication (with refresh token)")
            # Full OAuth with refresh capability
            self.creds = Credentials(
                token=credentials_dict.get('token'),
                refresh_token=credentials_dict.get('refresh_token'),
                token_uri=credentials_dict.get('token_uri', 'https://oauth2.googleapis.com/token'),
                client_id=credentials_dict.get('client_id'),
                client_secret=credentials_dict.get('client_secret'),
                scopes=credentials_dict.get('scopes', ['https://www.googleapis.com/auth/drive.readonly'])
            )
            
            # Refresh token if expired
            if self.creds.expired and self.creds.refresh_token:
                self.creds.refresh(Request())
        
        # Build Drive service
        self.service = build('drive', 'v3', credentials=self.creds)
        logger.info("✅ Google Drive connector initialized")
    
    def list_files(
        self, 
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        page_size: int = 100
    ) -> Dict[str, Any]:
        """
        List files in Google Drive folder.
        
        Args:
            folder_id: Google Drive folder ID (None for root)
            page_token: Token for pagination
            page_size: Number of files per page (max 1000)
        
        Returns:
            {
                "files": [{"id": "...", "name": "...", "mimeType": "...", ...}],
                "nextPageToken": "...",
                "hasMore": True/False
            }
        """
        try:
            # Build query
            query_parts = []
            if folder_id:
                query_parts.append(f"'{folder_id}' in parents")
            query_parts.append("trashed = false")
            query = " and ".join(query_parts)
            
            # Execute API call
            results = self.service.files().list(
                q=query,
                pageSize=page_size,
                pageToken=page_token,
                fields="nextPageToken, files(id, name, mimeType, size, parents, createdTime, modifiedTime, md5Checksum, webViewLink)",
                orderBy="name"
            ).execute()
            
            files = results.get('files', [])
            next_page_token = results.get('nextPageToken')
            
            logger.info(f"📂 Listed {len(files)} files from Google Drive")
            
            return {
                "files": files,
                "nextPageToken": next_page_token,
                "hasMore": bool(next_page_token)
            }
            
        except Exception as e:
            logger.error(f"❌ Error listing Google Drive files: {e}")
            raise
    
    def get_file_metadata(self, file_id: str) -> Dict[str, Any]:
        """
        Get metadata for a specific file.
        
        Args:
            file_id: Google Drive file ID
        
        Returns:
            File metadata dictionary
        """
        try:
            file_metadata = self.service.files().get(
                fileId=file_id,
                fields="id, name, mimeType, size, parents, createdTime, modifiedTime, md5Checksum, webViewLink"
            ).execute()
            
            return file_metadata
            
        except Exception as e:
            logger.error(f"❌ Error getting file metadata: {e}")
            raise
    
    def download_file(self, file_id: str) -> bytes:
        """
        Download file content from Google Drive.
        Uses direct HTTP request to bypass SSL/proxy issues.
        
        Args:
            file_id: Google Drive file ID
        
        Returns:
            File content as bytes
        """
        try:
            # Method 1: Use direct requests with access token (bypasses proxy issues)
            try:
                access_token = self.creds.token
                if not access_token and hasattr(self.creds, 'refresh') and self.creds.refresh_token:
                    self.creds.refresh(Request())
                    access_token = self.creds.token
                
                if access_token:
                    # Direct download URL
                    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
                    headers = {"Authorization": f"Bearer {access_token}"}
                    
                    # Make request without proxy
                    session = requests.Session()
                    session.trust_env = False  # Ignore system proxy settings
                    
                    response = session.get(url, headers=headers, timeout=60)
                    response.raise_for_status()
                    
                    content = response.content
                    logger.info(f"✅ Downloaded (direct): {len(content)} bytes")
                    return content
            except Exception as direct_err:
                logger.warning(f"Direct download failed, trying API method: {direct_err}")
            
            # Method 2: Fallback to Google API client
            request = self.service.files().get_media(fileId=file_id)
            file_buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(file_buffer, request)
            
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            file_buffer.seek(0)
            content = file_buffer.read()
            
            logger.info(f"✅ Downloaded (API): {len(content)} bytes")
            return content
            
        except Exception as e:
            logger.error(f"❌ Error downloading file: {e}")
            raise
    
    def get_folder_tree(self, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get folder structure recursively.
        
        Args:
            folder_id: Starting folder ID (None for root)
        
        Returns:
            List of all files and folders in tree
        """
        all_items = []
        
        def _get_items(current_folder_id: Optional[str]):
            page_token = None
            while True:
                result = self.list_files(current_folder_id, page_token)
                files = result['files']
                
                for file in files:
                    all_items.append(file)
                    
                    # If it's a folder, recurse into it
                    if file['mimeType'] == 'application/vnd.google-apps.folder':
                        _get_items(file['id'])
                
                page_token = result.get('nextPageToken')
                if not page_token:
                    break
        
        _get_items(folder_id)
        return all_items
    
    def get_credentials_dict(self) -> Dict[str, Any]:
        """
        Get current credentials as dictionary (for storage).
        
        Returns:
            Credentials dictionary with refreshed tokens
        """
        return {
            'token': self.creds.token,
            'refresh_token': self.creds.refresh_token,
            'token_uri': self.creds.token_uri,
            'client_id': self.creds.client_id,
            'client_secret': self.creds.client_secret,
            'scopes': self.creds.scopes
        }
