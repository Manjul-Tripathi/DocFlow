from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

folder_id = 'c115a06f-aa2d-4e3a-81ab-582e754acb49'

# Check document_folder_relationships
relationships = supabase.table('document_folder_relationships')\
    .select('*')\
    .eq('folder_id', folder_id)\
    .execute()

print(f"Documents in document_folder_relationships: {len(relationships.data)}")
for doc in relationships.data:
    print(f"  - {doc['document_id']} (confidence: {doc.get('confidence_score', 'N/A')})")

# Check document_shortcuts
shortcuts = supabase.table('document_shortcuts')\
    .select('*')\
    .eq('folder_id', folder_id)\
    .execute()

print(f"\nDocuments in document_shortcuts: {len(shortcuts.data)}")
for doc in shortcuts.data:
    print(f"  - {doc['document_id']}")
