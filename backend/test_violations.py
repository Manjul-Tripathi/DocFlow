"""
Test script to create sample compliance violations for testing
"""
from app.core.supabase import supabase
import uuid
from datetime import datetime, timedelta

def create_test_violations():
    """Create sample violations for testing"""
    
    # Get a labeled document
    doc_response = supabase.table('document_compliance_labels').select('*').eq('status', 'active').limit(1).execute()
    
    if not doc_response.data:
        print("❌ No labeled documents found. Please label a document first.")
        return
    
    doc_label = doc_response.data[0]
    doc_id = doc_label['document_id']
    label_id = doc_label['label_id']
    
    print(f"✅ Found labeled document: {doc_id}")
    
    # Create different types of violations
    violations = [
        {
            'id': str(uuid.uuid4()),
            'document_id': doc_id,
            'label_id': label_id,
            'violation_type': 'unauthorized_access',
            'severity': 'high',
            'detected_at': (datetime.now() - timedelta(days=2)).isoformat(),
            'detected_by': 'system',
            'description': 'Unauthorized user attempted to access CCPA-protected document',
            'user_involved': 'unauthorized.user@example.com',
            'resolved': False
        },
        {
            'id': str(uuid.uuid4()),
            'document_id': doc_id,
            'label_id': label_id,
            'violation_type': 'unauthorized_download',
            'severity': 'critical',
            'detected_at': (datetime.now() - timedelta(hours=6)).isoformat(),
            'detected_by': 'system',
            'description': 'Document downloaded from unauthorized location',
            'user_involved': 'external.user@example.com',
            'resolved': False
        },
        {
            'id': str(uuid.uuid4()),
            'document_id': doc_id,
            'label_id': label_id,
            'violation_type': 'geo_violation',
            'severity': 'medium',
            'detected_at': (datetime.now() - timedelta(days=5)).isoformat(),
            'detected_by': 'system',
            'description': 'Document accessed from restricted geographic region (China)',
            'resolved': True,
            'resolved_at': (datetime.now() - timedelta(days=3)).isoformat(),
            'resolved_by': 'admin@simplifyai.id',
            'resolution_notes': 'Access revoked. User credentials updated.'
        },
        {
            'id': str(uuid.uuid4()),
            'document_id': doc_id,
            'label_id': label_id,
            'violation_type': 'retention_breach',
            'severity': 'high',
            'detected_at': datetime.now().isoformat(),
            'detected_by': 'system',
            'description': 'Document exceeded maximum retention period of 180 days',
            'resolved': False
        }
    ]
    
    # Insert violations
    result = supabase.table('compliance_violations').insert(violations).execute()
    
    if result.data:
        print(f"\n✅ Successfully created {len(violations)} test violations:")
        for v in violations:
            status = "✅ Resolved" if v['resolved'] else "⚠️ Active"
            print(f"  - {v['violation_type']} ({v['severity']}) - {status}")
            print(f"    {v['description']}")
    else:
        print("❌ Failed to create violations")

if __name__ == "__main__":
    create_test_violations()
