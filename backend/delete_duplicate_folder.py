from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

# Get all folders with "airtel" in the name
folders = supabase.table('smart_folders')\
    .select('*')\
    .ilike('name', '%airtel%')\
    .execute()

print(f"Found {len(folders.data)} folders with 'airtel' in name:\n")
for folder in folders.data:
    print(f"  ID: {folder['id']}")
    print(f"  Name: {folder['name']}")
    print(f"  Created: {folder.get('created_at', 'N/A')}")
    print(f"  Document Count: {folder.get('document_count', 0)}")
    print(f"  Filter Rules: {folder.get('filter_rules')}")
    print()

# Find and delete "Airtel Payment Receipt" (auto-created duplicate)
for folder in folders.data:
    if folder['name'] == 'Airtel Payment Receipt':
        print(f"🗑️ Deleting duplicate folder: {folder['name']} (ID: {folder['id']})")
        
        # First, move documents from this folder to the manual "AirtelPayments" folder
        # Find the AirtelPayments folder
        airtel_payments = next((f for f in folders.data if 'AirtelPayments' in f['name']), None)
        
        if airtel_payments:
            # Get documents in the duplicate folder
            relationships = supabase.table('document_folder_relationships')\
                .select('document_id')\
                .eq('folder_id', folder['id'])\
                .execute()
            
            print(f"  Moving {len(relationships.data)} documents to '{airtel_payments['name']}'")
            
            # Move documents to the correct folder
            for rel in relationships.data:
                # Check if already exists in target folder
                existing = supabase.table('document_folder_relationships')\
                    .select('id')\
                    .eq('document_id', rel['document_id'])\
                    .eq('folder_id', airtel_payments['id'])\
                    .execute()
                
                if not existing.data:
                    # Add to target folder
                    supabase.table('document_folder_relationships')\
                        .insert({
                            'document_id': rel['document_id'],
                            'folder_id': airtel_payments['id'],
                            'confidence_score': 1.0,
                            'is_auto_assigned': True
                        })\
                        .execute()
            
            # Delete relationships from duplicate folder
            supabase.table('document_folder_relationships')\
                .delete()\
                .eq('folder_id', folder['id'])\
                .execute()
        
        # Delete the duplicate folder
        supabase.table('smart_folders')\
            .delete()\
            .eq('id', folder['id'])\
            .execute()
        
        print(f"✅ Deleted duplicate folder")

print("\n✅ Cleanup complete!")
