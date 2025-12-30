"""Check what's stored in document_versions table"""
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

sb = create_client(
    os.getenv('SUPABASE_URL'), 
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

# Get recent versions
result = sb.table('document_versions').select(
    'id, version_number, content, change_summary, document_id'
).order('version_number', desc=True).limit(10).execute()

print("\n=== Recent document_versions ===\n")
for r in result.data:
    content = str(r['content']) if r['content'] else 'NULL'
    content_preview = content[:500] if len(content) > 500 else content
    print(f"Version {r['version_number']}:")
    print(f"  Document ID: {r['document_id']}")
    print(f"  Change Summary: {r['change_summary']}")
    print(f"  Content Length: {len(content)} chars")
    print(f"  Content Type: {'JSON' if content.startswith('{') else 'TEXT' if len(content) > 100 else 'PATH/ID'}")
    print(f"  Content Preview:\n{content_preview}")
    print("-" * 80)

# For the AirtelReceipt document specifically, let's compare
print("\n\n=== AirtelReceipt PDF Comparison ===")
airtel_versions = [r for r in result.data if r['document_id'] == 'eaf4cde9-03ae-40c9-923f-5c54b233a47f']
if len(airtel_versions) >= 2:
    v1 = next((v for v in airtel_versions if v['version_number'] == 1), None)
    v2 = next((v for v in airtel_versions if v['version_number'] == 2), None)
    if v1 and v2:
        print(f"\nV1 Content ({len(v1['content'])} chars):")
        print(v1['content'][:600])
        print(f"\n\nV2 Content ({len(v2['content'])} chars):")
        print(v2['content'][:600])
        print(f"\n\nAre they identical? {v1['content'] == v2['content']}")
