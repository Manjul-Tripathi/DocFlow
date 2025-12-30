"""
Quick script to check if migration tables exist in Supabase
"""
from app.core.supabase_client import get_supabase_client

def check_migration_tables():
    supabase = get_supabase_client()
    
    tables_to_check = [
        'migration_jobs',
        'migration_items',
        'migration_credentials'
    ]
    
    print("\n🔍 Checking Migration Tables in Supabase...\n")
    
    for table_name in tables_to_check:
        try:
            result = supabase.table(table_name).select('id').limit(1).execute()
            print(f"✅ {table_name} - EXISTS")
        except Exception as e:
            print(f"❌ {table_name} - NOT FOUND")
            print(f"   Error: {str(e)[:100]}")
    
    print("\n" + "="*50)

if __name__ == "__main__":
    check_migration_tables()
