-- Test Processing Pipeline Data
-- Run this AFTER running 20251229000000_create_processing_pipeline.sql to add some test documents to the queue

-- First, get some existing documents that aren't in processing queue yet
-- and add them with different stages for testing

-- Reset and add test data to processing queue
-- Delete existing test entries first (get first 3 documents)
WITH sample_docs AS (
  SELECT id, user_id
  FROM documents
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 3
)
DELETE FROM document_processing_queue 
WHERE document_id IN (SELECT id FROM sample_docs);

-- Add documents at different stages
WITH sample_docs AS (
  SELECT id, user_id
  FROM documents
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 3
)
INSERT INTO document_processing_queue (document_id, user_id, stage, priority, attempts, progress_percent, created_at, started_at)
SELECT 
  id as document_id,
  user_id,
  CASE (row_number() OVER ())::int % 3
    WHEN 0 THEN 'uploaded'
    WHEN 1 THEN 'text_extraction'  
    WHEN 2 THEN 'classification'
  END as stage,
  100 as priority,
  0 as attempts,
  CASE (row_number() OVER ())::int % 3
    WHEN 0 THEN 0
    WHEN 1 THEN 33
    WHEN 2 THEN 50
  END as progress_percent,
  NOW() - ((row_number() OVER ()) * interval '5 minutes') as created_at,
  CASE (row_number() OVER ())::int % 3
    WHEN 0 THEN NULL
    ELSE NOW() - ((row_number() OVER ()) * interval '4 minutes')
  END as started_at
FROM sample_docs
ON CONFLICT DO NOTHING;

-- Also add to search index queue
WITH sample_docs AS (
  SELECT id, user_id
  FROM documents
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 3
)
INSERT INTO search_index_queue (document_id, user_id, operation, status, priority, created_at)
SELECT 
  id as document_id,
  user_id,
  'index' as operation,
  'pending' as status,
  100 as priority,
  NOW()
FROM sample_docs
ON CONFLICT DO NOTHING;

-- Add one failed document for testing retry
INSERT INTO document_processing_queue (document_id, user_id, stage, priority, attempts, max_attempts, last_error, created_at, started_at)
SELECT 
  id as document_id,
  user_id,
  'failed' as stage,
  100 as priority,
  2 as attempts,
  3 as max_attempts,
  'OCR extraction failed: Unable to process image-heavy PDF' as last_error,
  NOW() - interval '30 minutes' as created_at,
  NOW() - interval '25 minutes' as started_at
FROM documents
WHERE deleted_at IS NULL
ORDER BY created_at DESC
OFFSET 3
LIMIT 1
ON CONFLICT DO NOTHING;

-- Verify the test data
SELECT 
  dpq.id,
  COALESCE(d.name, d.file_name) as document_title,
  dpq.stage,
  dpq.progress_percent,
  dpq.attempts,
  dpq.last_error,
  dpq.created_at
FROM document_processing_queue dpq
JOIN documents d ON d.id = dpq.document_id
ORDER BY dpq.created_at DESC;
