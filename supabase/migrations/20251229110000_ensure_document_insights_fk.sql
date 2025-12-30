-- Ensure document_insights table exists and has proper foreign key relationship

-- Create document_insights table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.document_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  user_id UUID NOT NULL,
  importance_score NUMERIC(3,2),
  key_topics JSONB DEFAULT '[]',
  document_type TEXT,
  categories JSONB DEFAULT '[]',
  ai_generated_title TEXT,
  summary TEXT,
  sentiment_analysis JSONB,
  suggested_actions JSONB,
  readability_score NUMERIC(3,2),
  word_count INTEGER,
  estimated_reading_time INTEGER,
  language_detected TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT document_insights_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_insights_document_id ON public.document_insights(document_id);
CREATE INDEX IF NOT EXISTS idx_document_insights_user_id ON public.document_insights(user_id);

-- Add RLS policies
ALTER TABLE public.document_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own document insights"
  ON public.document_insights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document insights"
  ON public.document_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own document insights"
  ON public.document_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own document insights"
  ON public.document_insights
  FOR DELETE
  USING (auth.uid() = user_id);
