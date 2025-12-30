-- Document Comparison History Table
-- Store all document comparisons (versions, documents, AI analysis) in one table

-- Create comparison_history table
CREATE TABLE IF NOT EXISTS public.comparison_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Document information
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  
  -- Comparison type and metadata
  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('version', 'document', 'ai')),
  base_version TEXT NOT NULL,
  compare_version TEXT NOT NULL,
  changes_count INTEGER DEFAULT 0,
  
  -- Version comparison details
  base_version_id UUID,
  compare_version_id UUID,
  
  -- Document comparison details
  doc1_id UUID,
  doc2_id UUID,
  
  -- Comparison data
  comparison_data JSONB DEFAULT '{}'::jsonb, -- Full VersionComparison object
  
  -- AI Analysis
  has_ai_analysis BOOLEAN DEFAULT false,
  ai_analysis_text TEXT,
  ai_model_used TEXT,
  ai_context_type TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure valid comparison references
  CONSTRAINT valid_version_comparison CHECK (
    (comparison_type = 'version' AND base_version_id IS NOT NULL AND compare_version_id IS NOT NULL) OR
    (comparison_type = 'document' AND doc1_id IS NOT NULL AND doc2_id IS NOT NULL) OR
    (comparison_type = 'ai' AND base_version_id IS NOT NULL AND compare_version_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.comparison_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own comparison history" ON public.comparison_history;
CREATE POLICY "Users can view their own comparison history"
ON public.comparison_history
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own comparison history" ON public.comparison_history;
CREATE POLICY "Users can create their own comparison history"
ON public.comparison_history
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own comparison history" ON public.comparison_history;
CREATE POLICY "Users can update their own comparison history"
ON public.comparison_history
FOR UPDATE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own comparison history" ON public.comparison_history;
CREATE POLICY "Users can delete their own comparison history"
ON public.comparison_history
FOR DELETE
USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comparison_history_user_id ON public.comparison_history(user_id);
CREATE INDEX IF NOT EXISTS idx_comparison_history_document_id ON public.comparison_history(document_id);
CREATE INDEX IF NOT EXISTS idx_comparison_history_created_at ON public.comparison_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comparison_history_type ON public.comparison_history(comparison_type);
CREATE INDEX IF NOT EXISTS idx_comparison_history_versions ON public.comparison_history(base_version_id, compare_version_id) WHERE comparison_type IN ('version', 'ai');
CREATE INDEX IF NOT EXISTS idx_comparison_history_documents ON public.comparison_history(doc1_id, doc2_id) WHERE comparison_type = 'document';

-- Add comment
COMMENT ON TABLE public.comparison_history IS 'Stores all document comparison history including version comparisons, document comparisons, and AI analysis results';

