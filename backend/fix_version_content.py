"""
Fix existing document versions to have consistent content extraction.
This script updates ALL versions that have inconsistent content extraction.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load env manually
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                key, val = line.strip().split('=', 1)
                os.environ[key] = val

from supabase import create_client
import fitz  # PyMuPDF
import requests

sb = create_client(
    os.getenv('SUPABASE_URL'), 
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

def extract_pdf_text(file_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF with sort=True for consistent reading order"""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text_parts = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text", sort=True)
        if text.strip():
            text_parts.append(text.strip())
    doc.close()
    return "\n\n".join(text_parts)

def fix_version_content():
    """Fix ALL versions to use consistent extraction"""
    
    print("\n=== Fixing ALL Version Content ===\n")
    
    # Get documents with versions
    docs_result = sb.table('documents').select('id, file_name, file_type, storage_path, metadata').execute()
    
    for doc in docs_result.data:
        doc_id = doc['id']
        file_name = doc.get('file_name', 'unknown')
        file_type = doc.get('file_type', '')
        metadata = doc.get('metadata', {}) or {}
        
        # Only process PDFs
        if 'pdf' not in file_type.lower():
            continue
        
        # Get all versions for this document
        versions = sb.table('document_versions').select('id, version_number, content').eq('document_id', doc_id).order('version_number').execute()
        
        if not versions.data:
            continue
            
        print(f"\n{'='*60}")
        print(f"Processing: {file_name} ({doc_id})")
        print(f"Found {len(versions.data)} versions")
        
        # Get all storage paths from metadata
        version_storage = {}
        if 'versions' in metadata:
            for v in metadata['versions']:
                version_storage[v.get('version')] = v.get('storage_path')
        
        # Also add the original storage_path for v1
        original_storage = doc.get('storage_path')
        if original_storage:
            version_storage[1] = original_storage
            
        for version in versions.data:
            v_num = version['version_number']
            v_id = version['id']
            current_content = version.get('content', '')
            
            # Get storage path for this version
            storage_path = version_storage.get(v_num)
            
            if not storage_path:
                print(f"  V{v_num}: No storage path found, skipping")
                continue
                
            print(f"\n  V{v_num}:")
            print(f"    Current content length: {len(current_content)} chars")
            print(f"    Storage path: {storage_path}")
            
            try:
                # Download PDF from storage
                url_result = sb.storage.from_('documents').create_signed_url(storage_path, 3600)
                signed_url = url_result.get('signedUrl')
                
                if not signed_url:
                    print(f"    ERROR: Could not get signed URL")
                    continue
                
                response = requests.get(signed_url)
                if response.status_code != 200:
                    print(f"    ERROR: Could not download PDF: {response.status_code}")
                    continue
                
                file_bytes = response.content
                
                # Extract text
                extracted_text = extract_pdf_text(file_bytes)
                print(f"    Newly extracted: {len(extracted_text)} chars")
                print(f"    Preview: {extracted_text[:100]}...")
                
                # Update version content
                update_result = sb.table('document_versions').update({
                    'content': extracted_text
                }).eq('id', v_id).execute()
                
                if update_result.data:
                    print(f"    ✅ Updated V{v_num}")
                else:
                    print(f"    ❌ Failed to update V{v_num}")
                    
            except Exception as e:
                print(f"    ERROR: {e}")

if __name__ == "__main__":
    fix_version_content()
    print("\n\n=== Done ===\n")
