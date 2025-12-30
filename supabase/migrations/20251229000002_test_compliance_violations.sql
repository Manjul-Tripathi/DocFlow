-- Test Compliance Violations
-- Run this SQL in your Supabase SQL Editor to create test violations

-- First, get a document with compliance labels
-- Replace 'YOUR_DOCUMENT_ID' and 'YOUR_LABEL_ID' with actual IDs from document_compliance_labels table

-- Example: Get document IDs that have compliance labels
-- SELECT document_id, label_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1;

-- Create test violations (update the document_id and label_id values first)
INSERT INTO compliance_violations (
  id,
  document_id,
  label_id,
  violation_type,
  severity,
  detected_at,
  detected_by,
  description,
  user_involved,
  resolved
) VALUES
  -- Violation 1: Unauthorized Access
  (
    gen_random_uuid(),
    (SELECT document_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    (SELECT label_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    'unauthorized_access',
    'high',
    NOW() - INTERVAL '2 days',
    'system',
    'Unauthorized user (unauthorized.user@example.com) attempted to access CCPA-protected document',
    NULL,
    false
  ),
  
  -- Violation 2: Unauthorized Download
  (
    gen_random_uuid(),
    (SELECT document_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    (SELECT label_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    'unauthorized_download',
    'critical',
    NOW() - INTERVAL '6 hours',
    'system',
    'Document downloaded by external.user@example.com from unauthorized location without proper authorization',
    NULL,
    false
  ),
  
  -- Violation 3: Geo Violation (RESOLVED)
  (
    gen_random_uuid(),
    (SELECT document_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    (SELECT label_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    'geo_violation',
    'medium',
    NOW() - INTERVAL '5 days',
    'system',
    'Document accessed by remote.user@example.com from restricted geographic region (China)',
    NULL,
    true
  ),
  
  -- Violation 4: Retention Breach
  (
    gen_random_uuid(),
    (SELECT document_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    (SELECT label_id FROM document_compliance_labels WHERE status = 'active' LIMIT 1),
    'retention_breach',
    'high',
    NOW(),
    'system',
    'Document exceeded maximum retention period of 180 days',
    NULL,
    false
  );

-- Update the resolved violation with resolution details
UPDATE compliance_violations
SET 
  resolved_at = NOW() - INTERVAL '3 days',
  resolved_by = NULL,
  resolution_notes = 'Resolved by admin@simplifyai.id - Access revoked. User credentials updated. IP blocked.'
WHERE violation_type = 'geo_violation' AND resolved = true;

-- Verify violations were created
SELECT 
  violation_type,
  severity,
  description,
  CASE WHEN resolved THEN '✅ Resolved' ELSE '⚠️ Active' END as status
FROM compliance_violations
ORDER BY detected_at DESC;
