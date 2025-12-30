"""
Test script to verify Google Drive credentials work
"""
import sys
sys.path.insert(0, 'backend')

from app.core.supabase_client import get_supabase_client
from app.services.google_drive_connector import GoogleDriveConnector

def test_credentials():
    print("🔍 Testing Google Drive credentials...")
    
    supabase = get_supabase_client()
    
    # Get the latest credentials
    response = supabase.table('migration_credentials').select('*').order('created_at', desc=True).limit(1).execute()
    
    if not response.data:
        print("❌ No credentials found in database")
        return
    
    cred = response.data[0]
    print(f"\n📋 Credential: {cred['name']}")
    print(f"🔑 Credential ID: {cred['id']}")
    print(f"📅 Created: {cred['created_at']}")
    
    credentials_data = cred['credentials_encrypted']
    print(f"\n🔐 Credentials keys: {list(credentials_data.keys())}")
    
    # Try to initialize connector
    try:
        print("\n🚀 Initializing Google Drive connector...")
        connector = GoogleDriveConnector(credentials_data)
        print("✅ Connector initialized successfully!")
        
        # Try to list files
        print("\n📂 Testing file listing...")
        result = connector.list_files(page_size=5)
        print(f"✅ Found {len(result['files'])} files")
        
        for file in result['files'][:3]:
            print(f"  - {file['name']} ({file['mimeType']})")
        
        print("\n🎉 Credentials are working!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        print(f"\nFull traceback:\n{traceback.format_exc()}")

if __name__ == "__main__":
    test_credentials()
