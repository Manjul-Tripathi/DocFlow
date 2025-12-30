"""
OneDrive Connector for Migration Module
Handles OAuth authentication and file operations with Microsoft Graph API
"""
from typing import Dict, List, Optional, Any
import logging
import requests
import urllib.parse

logger = logging.getLogger(__name__)

class OneDriveConnector:
    """
    Connector for Microsoft OneDrive (Graph API) operations.
    Handles authentication, file discovery, and downloads.
    """
    
    BASE_URL = "https://graph.microsoft.com/v1.0"
    
    def __init__(self, credentials_dict: Dict[str, Any]):
        """
        Initialize OneDrive connector with OAuth credentials.
        
        Args:
            credentials_dict: Dictionary containing OAuth tokens
        """
        self.access_token = credentials_dict.get('access_token')
        if not self.access_token:
            raise ValueError("No access token provided for OneDrive connector")
            
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        logger.info("✅ OneDrive connector initialized")
    
    def list_files(
        self, 
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        page_size: int = 100
    ) -> Dict[str, Any]:
        """
        List files in OneDrive folder.
        
        Args:
            folder_id: OneDrive folder ID (None for root)
            page_token: Token for pagination (NextLink)
            page_size: Number of files per page (approximated, Graph API uses $top)
        
        Returns:
            {
                "files": [{"id": "...", "name": "...", "mimeType": "...", ...}],
                "nextPageToken": "...",
                "hasMore": True/False
            }
        """
        try:
            # Build URL
            if page_token:
                # If we have a next link, use it directly
                url = page_token
            else:
                # Construct initial URL
                if folder_id:
                    endpoint = f"/me/drive/items/{folder_id}/children"
                else:
                    endpoint = f"/me/drive/root/children"
                
                # Add query parameters
                params = [
                    f"$top={page_size}",
                    "$select=id,name,file,folder,size,createdDateTime,lastModifiedDateTime,webUrl,parentReference"
                ]
                url = f"{self.BASE_URL}{endpoint}?{'&'.join(params)}"
            
            # Execute API call
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            # Process files into unified format
            raw_files = data.get('value', [])
            files = []
            
            for f in raw_files:
                # Normalize to match Google Drive format roughly for frontend compatibility
                is_folder = 'folder' in f
                mime_type = 'application/vnd.google-apps.folder' if is_folder else f.get('file', {}).get('mimeType', 'application/octet-stream')
                
                file_obj = {
                    'id': f.get('id'),
                    'name': f.get('name'),
                    'mimeType': mime_type,
                    'size': f.get('size'),
                    'createdTime': f.get('createdDateTime'),
                    'modifiedTime': f.get('lastModifiedDateTime'),
                    'webViewLink': f.get('webUrl'),
                    'parents': [f.get('parentReference', {}).get('id')] if f.get('parentReference') else []
                }
                files.append(file_obj)
            
            next_link = data.get('@odata.nextLink')
            
            logger.info(f"📂 Listed {len(files)} files from OneDrive")
            
            return {
                "files": files,
                "nextPageToken": next_link,
                "hasMore": bool(next_link)
            }
            
        except Exception as e:
            logger.error(f"❌ Error listing OneDrive files: {e}")
            raise
    
    def get_file_metadata(self, file_id: str) -> Dict[str, Any]:
        """
        Get metadata for a specific file.
        
        Args:
            file_id: OneDrive file ID
        
        Returns:
            File metadata dictionary
        """
        try:
            url = f"{self.BASE_URL}/me/drive/items/{file_id}"
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()
            f = response.json()
            
            is_folder = 'folder' in f
            mime_type = 'application/vnd.google-apps.folder' if is_folder else f.get('file', {}).get('mimeType', 'application/octet-stream')
            
            return {
                'id': f.get('id'),
                'name': f.get('name'),
                'mimeType': mime_type,
                'size': f.get('size'),
                'createdTime': f.get('createdDateTime'),
                'modifiedTime': f.get('lastModifiedDateTime'),
                'webViewLink': f.get('webUrl')
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting file metadata: {e}")
            raise
    
    def download_file(self, file_id: str) -> bytes:
        """
        Download file content from OneDrive.
        
        Args:
            file_id: OneDrive file ID
        
        Returns:
            File content as bytes
        """
        try:
            # Get download URL
            url = f"{self.BASE_URL}/me/drive/items/{file_id}/content"
            
            response = requests.get(url, headers=self.headers, timeout=60)
            response.raise_for_status()
            
            content = response.content
            logger.info(f"✅ Downloaded: {len(content)} bytes")
            return content
            
        except Exception as e:
            logger.error(f"❌ Error downloading file: {e}")
            raise
