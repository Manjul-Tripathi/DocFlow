-- Document Versions Table for Version Control
-- Track all changes and revisions made to documents

-- Create document_versions table
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  version_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_summary TEXT,
  
  -- Ensure unique version numbers per document
  CONSTRAINT unique_document_version UNIQUE (document_id, version_number)
);

-- Enable RLS
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view versions of their documents" ON public.document_versions;
CREATE POLICY "Users can view versions of their documents"
ON public.document_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents 
    WHERE documents.id = document_versions.document_id 
    AND documents.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create versions for their documents" ON public.document_versions;
CREATE POLICY "Users can create versions for their documents"
ON public.document_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents 
    WHERE documents.id = document_versions.document_id 
    AND documents.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete versions of their documents" ON public.document_versions;
CREATE POLICY "Users can delete versions of their documents"
ON public.document_versions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.documents 
    WHERE documents.id = document_versions.document_id 
    AND documents.user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON public.document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_version_created_at ON public.document_versions(version_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_by ON public.document_versions(created_by);

-- Function to automatically increment version number
CREATE OR REPLACE FUNCTION public.get_next_version_number(doc_id UUID)
RETURNS INTEGER AS $$
DECLARE
  max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO max_version
  FROM public.document_versions
  WHERE document_id = doc_id;
  
  RETURN max_version;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_version_number(UUID) TO authenticated;

-- Add comment
COMMENT ON TABLE public.document_versions IS 'Stores version history for documents edited through the document editor';