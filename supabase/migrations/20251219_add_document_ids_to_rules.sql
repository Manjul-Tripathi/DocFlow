-- Add document_ids column to content_access_rules for document-first rule creation
-- This allows rules to be applied to specific selected documents

ALTER TABLE content_access_rules
ADD COLUMN IF NOT EXISTS document_ids TEXT[] DEFAULT '{}';

COMMENT ON COLUMN content_access_rules.document_ids IS 'Array of specific document IDs this rule applies to (for document-first approach)';
