-- Processing Pipeline Setup SQL
-- Run this in Supabase SQL Editor to set up the processing pipeline tables and triggers

-- =====================================================
-- 1. Create search_index_queue table (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.search_index_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  operation TEXT NOT NULL DEFAULT 'index' CHECK (operation IN ('index', 'reindex', 'delete')),
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 100,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.search_index_queue ENABLE ROW LEVEL SECURITY;

-- Policies for search_index_queue
DROP POLICY IF EXISTS "Users view own search queue" ON public.search_index_queue;
CREATE POLICY "Users view own search queue" ON public.search_index_queue FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own search queue" ON public.search_index_queue;
CREATE POLICY "Users insert own search queue" ON public.search_index_queue FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own search queue" ON public.search_index_queue;
CREATE POLICY "Users update own search queue" ON public.search_index_queue FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own search queue" ON public.search_index_queue;
CREATE POLICY "Users delete own search queue" ON public.search_index_queue FOR DELETE USING (auth.uid() = user_id);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_search_queue_pending ON public.search_index_queue(status, priority, created_at) WHERE status = 'pending';

-- =====================================================
-- 2. Add missing policies for document_processing_queue
-- =====================================================
DROP POLICY IF EXISTS "Users insert own processing queue" ON public.document_processing_queue;
CREATE POLICY "Users insert own processing queue" ON public.document_processing_queue FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own processing queue" ON public.document_processing_queue;
CREATE POLICY "Users update own processing queue" ON public.document_processing_queue FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own processing queue" ON public.document_processing_queue;
CREATE POLICY "Users delete own processing queue" ON public.document_processing_queue FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- 3. Create function to auto-queue documents for processing
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_queue_document_for_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if this is a new document (not a restoration or update)
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    -- Add to processing queue
    INSERT INTO public.document_processing_queue (document_id, user_id, stage, priority)
    VALUES (NEW.id, NEW.user_id, 'uploaded', 100)
    ON CONFLICT DO NOTHING;
    
    -- Add to search index queue
    INSERT INTO public.search_index_queue (document_id, user_id, operation, priority)
    VALUES (NEW.id, NEW.user_id, 'index', 100)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on documents table
DROP TRIGGER IF EXISTS trigger_auto_queue_document ON public.documents;
CREATE TRIGGER trigger_auto_queue_document
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_queue_document_for_processing();

-- =====================================================
-- 4. Create function to simulate processing stages
-- This can be called manually or by a background worker
-- =====================================================
CREATE OR REPLACE FUNCTION public.advance_processing_stage(queue_id UUID)
RETURNS TEXT AS $$
DECLARE
  current_stage TEXT;
  next_stage TEXT;
  stages TEXT[] := ARRAY['uploaded', 'virus_scan', 'text_extraction', 'classification', 'embedding', 'indexing', 'completed'];
  current_idx INTEGER;
BEGIN
  -- Get current stage
  SELECT stage INTO current_stage
  FROM public.document_processing_queue
  WHERE id = queue_id;
  
  IF current_stage IS NULL THEN
    RETURN 'not_found';
  END IF;
  
  IF current_stage = 'completed' OR current_stage = 'failed' THEN
    RETURN current_stage;
  END IF;
  
  -- Find current index
  current_idx := array_position(stages, current_stage);
  
  IF current_idx IS NULL OR current_idx >= array_length(stages, 1) THEN
    RETURN 'error';
  END IF;
  
  -- Get next stage
  next_stage := stages[current_idx + 1];
  
  -- Update to next stage
  UPDATE public.document_processing_queue
  SET 
    stage = next_stage,
    started_at = COALESCE(started_at, now()),
    completed_at = CASE WHEN next_stage = 'completed' THEN now() ELSE NULL END,
    progress_percent = CASE 
      WHEN next_stage = 'completed' THEN 100
      ELSE (current_idx * 100 / (array_length(stages, 1) - 1))
    END
  WHERE id = queue_id;
  
  -- If completed, also update search index
  IF next_stage = 'completed' THEN
    UPDATE public.search_index_queue
    SET status = 'completed', processed_at = now()
    WHERE document_id = (SELECT document_id FROM public.document_processing_queue WHERE id = queue_id);
  END IF;
  
  RETURN next_stage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. Create function to mark processing as failed
-- =====================================================
CREATE OR REPLACE FUNCTION public.fail_processing(queue_id UUID, error_message TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.document_processing_queue
  SET 
    stage = 'failed',
    last_error = error_message,
    attempts = attempts + 1
  WHERE id = queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Queue existing documents that aren't in the queue
-- =====================================================
INSERT INTO public.document_processing_queue (document_id, user_id, stage, priority, completed_at, progress_percent)
SELECT 
  d.id, 
  d.user_id, 
  'completed',  -- Mark existing documents as already processed
  50,           -- Lower priority
  d.created_at, -- Use creation date as completion date
  100           -- 100% progress
FROM public.documents d
LEFT JOIN public.document_processing_queue dpq ON d.id = dpq.document_id
WHERE dpq.id IS NULL 
  AND d.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Also add to search index queue as completed
INSERT INTO public.search_index_queue (document_id, user_id, operation, status, processed_at)
SELECT 
  d.id, 
  d.user_id, 
  'index',
  'completed',
  d.created_at
FROM public.documents d
LEFT JOIN public.search_index_queue siq ON d.id = siq.document_id
WHERE siq.id IS NULL 
  AND d.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. Verify the setup
-- =====================================================
SELECT 'Setup completed!' as status;

-- Show queue stats
SELECT 
  'Processing Queue' as queue_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE stage = 'uploaded') as pending,
  COUNT(*) FILTER (WHERE stage NOT IN ('uploaded', 'completed', 'failed')) as in_progress,
  COUNT(*) FILTER (WHERE stage = 'completed') as completed,
  COUNT(*) FILTER (WHERE stage = 'failed') as failed
FROM public.document_processing_queue
UNION ALL
SELECT 
  'Search Index Queue',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'pending'),
  COUNT(*) FILTER (WHERE status = 'processing'),
  COUNT(*) FILTER (WHERE status = 'completed'),
  COUNT(*) FILTER (WHERE status = 'failed')
FROM public.search_index_queue;
