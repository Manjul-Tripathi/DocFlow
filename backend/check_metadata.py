"""Check metadata for document versions"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load env
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                key, val = line.strip().split('=', 1)
                os.environ[key] = val

from supabase import create_client

sb = create_client(
    os.getenv('SUPABASE_URL'), 
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

# Check AirtelReceipt document
doc_id = 'eaf4cde9-03ae-40c9-923f-5c54b233a47f'
doc = sb.table('documents').select('*').eq('id', doc_id).single().execute()

print(f"\n=== Document: {doc.data.get('file_name')} ===")
print(f"Storage path: {doc.data.get('storage_path')}")
print(f"\nMetadata:")
import json
metadata = doc.data.get('metadata', {})
print(json.dumps(metadata, indent=2))

# Also check document_versions
print(f"\n=== Document Versions ===")
versions = sb.table('document_versions').select('*').eq('document_id', doc_id).order('version_number').execute()
for v in versions.data:
    print(f"\nV{v['version_number']}:")
    print(f"  ID: {v['id']}")
    print(f"  Change Summary: {v.get('change_summary')}")
    print(f"  Content length: {len(v.get('content', ''))}")
    print(f"  Content preview: {v.get('content', '')[:100]}...")
