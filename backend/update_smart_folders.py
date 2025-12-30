from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

# Get all folders that have filter_rules but is_smart is not set or is False
folders = supabase.table('smart_folders')\
    .select('*')\
    .execute()

print(f"Total folders: {len(folders.data)}")
print("\nFolder details:")
for folder in folders.data:
    print(f"  - {folder['name']}: is_smart={folder.get('is_smart')}, has_filter_rules={bool(folder.get('filter_rules'))}")

updated_count = 0
for folder in folders.data:
    # Update ALL folders to have is_smart = True
    # (since all folders in this system are smart folders with AI organization)
    print(f"Updating folder: {folder['name']} (ID: {folder['id']})")
    
    # Update the folder to set is_smart = True
    supabase.table('smart_folders')\
        .update({'is_smart': True})\
        .eq('id', folder['id'])\
        .execute()
    
    updated_count += 1

print(f"\n✅ Updated {updated_count} folders to be smart folders")
