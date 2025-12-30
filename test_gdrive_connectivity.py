import os
import json
import logging
import socket
from google.oauth2 import service_account
from googleapiclient.discovery import build
import httplib2

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_connectivity():
    logger.info("Testing network connectivity...")
    try:
        host = "www.googleapis.com"
        port = 443
        socket.create_connection((host, port), timeout=5)
        logger.info(f"✅ Connection to {host}:{port} successful")
    except Exception as e:
        logger.error(f"❌ Connection to {host}:{port} failed: {e}")

def test_service_account():
    logger.info("Testing Service Account...")
    
    # Path to service account file
    sa_path = os.path.join(os.getcwd(), 'backend', 'google-service-account.json')
    if not os.path.exists(sa_path):
        logger.error(f"❌ Service account file not found at: {sa_path}")
        return

    try:
        # Load credentials
        creds = service_account.Credentials.from_service_account_file(
            sa_path, 
            scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        logger.info("🔑 Service Account loaded")
        
        # Build service
        http = httplib2.Http(disable_ssl_certificate_validation=False)
        service = build('drive', 'v3', credentials=creds)
        
        # List files
        results = service.files().list(
            pageSize=5, 
            fields="nextPageToken, files(id, name)"
        ).execute()
        
        files = results.get('files', [])
        logger.info(f"✅ Successfully listed {len(files)} files")
        for f in files:
            logger.info(f" - {f['name']} ({f['id']})")
            
    except Exception as e:
        logger.error(f"❌ Service Account test failed: {e}")

if __name__ == "__main__":
    test_connectivity()
    print("-" * 50)
    test_service_account()
