-- Enable storage access for guest document viewing
-- This allows signed URLs to work for documents shared via external_shares

-- Ensure the documents storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop existing policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can access shared documents via signed URL" ON storage.objects;

-- Policy: Allow users to upload their own documents
CREATE POLICY "Users can upload documents" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Allow users to read their own documents
CREATE POLICY "Users can read own documents" 
ON storage.objects FOR SELECT 
USING (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Allow users to update their own documents
CREATE POLICY "Users can update own documents" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Allow users to delete their own documents  
CREATE POLICY "Users can delete own documents" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- CRITICAL: Allow public access to documents that are in external_shares
-- This enables signed URLs to work for guest users
CREATE POLICY "Public can access shared documents via signed URL"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' 
  AND EXISTS (
    SELECT 1 FROM public.external_shares
    WHERE external_shares.resource_type = 'document'
      AND external_shares.status IN ('pending', 'accepted')
      -- Match the document ID from the storage path
      -- Storage path format is typically: user_id/document_id/filename
      AND storage.objects.name LIKE '%' || external_shares.resource_id || '%'
  )
);
