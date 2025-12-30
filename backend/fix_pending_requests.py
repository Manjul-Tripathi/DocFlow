"""
Quick fix script to mark fully-signed requests as completed
Run this from the backend directory: python fix_pending_requests.py
"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("❌ Missing Supabase credentials in .env")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Get all pending requests
pending_requests = supabase.table('signature_requests').select('id, title').eq('status', 'pending').execute()

fixed_count = 0
for request in pending_requests.data:
    request_id = request['id']
    
    # Get all signers for this request
    signers = supabase.table('signature_signers').select('status, role').eq('request_id', request_id).execute()
    
    # Check if all signers/approvers have signed
    signers_to_check = [s for s in signers.data if s['role'] in ('signer', 'approver')]
    
    if signers_to_check and all(s['status'] == 'signed' for s in signers_to_check):
        # All signed - mark as completed
        supabase.table('signature_requests').update({
            'status': 'completed',
            'completed_at': 'now()'
        }).eq('id', request_id).execute()
        
        print(f"Fixed: {request['title']}")
        fixed_count += 1

print(f"\nDone! Fixed {fixed_count} request(s)")
