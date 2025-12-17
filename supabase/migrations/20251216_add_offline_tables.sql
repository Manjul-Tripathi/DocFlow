-- Migration: Add offline access tracking table
-- This table tracks which documents users have downloaded for offline access

-- Create offline_access table
CREATE TABLE IF NOT EXISTS public.offline_access (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    document_id uuid NOT NULL,
    file_size bigint DEFAULT 0,
    downloaded_at timestamp with time zone NOT NULL DEFAULT now(),
    version_downloaded integer DEFAULT 1,
    last_accessed timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT offline_access_pkey PRIMARY KEY (id),
    CONSTRAINT offline_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT offline_access_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE,
    CONSTRAINT offline_access_unique UNIQUE (user_id, document_id)
);

-- Create document_versions table for tracking version history
CREATE TABLE IF NOT EXISTS public.document_versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    version integer NOT NULL DEFAULT 1,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_by uuid,
    change_summary text,
    CONSTRAINT document_versions_pkey PRIMARY KEY (id),
    CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_offline_access_user_id ON public.offline_access(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_access_document_id ON public.offline_access(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON public.document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_version ON public.document_versions(document_id, version DESC);

-- Enable RLS
ALTER TABLE public.offline_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for offline_access
CREATE POLICY "Users can view their own offline access records"
    ON public.offline_access FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own offline access records"
    ON public.offline_access FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own offline access records"
    ON public.offline_access FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own offline access records"
    ON public.offline_access FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for document_versions (public read, owner write)
CREATE POLICY "Users can view versions of their documents"
    ON public.document_versions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.documents 
            WHERE documents.id = document_versions.document_id 
            AND documents.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create versions for their documents"
    ON public.document_versions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.documents 
            WHERE documents.id = document_versions.document_id 
            AND documents.user_id = auth.uid()
        )
    );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_offline_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_offline_access_updated_at ON public.offline_access;
CREATE TRIGGER trigger_offline_access_updated_at
    BEFORE UPDATE ON public.offline_access
    FOR EACH ROW
    EXECUTE FUNCTION update_offline_access_updated_at();

-- Comments
COMMENT ON TABLE public.offline_access IS 'Tracks which documents users have downloaded for offline access';
COMMENT ON TABLE public.document_versions IS 'Version history for documents to support offline sync conflict detection';
