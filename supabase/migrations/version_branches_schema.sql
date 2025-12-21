-- Create version_branches table for document version branching system
-- This table enables branching and merging workflows for document versions

CREATE TABLE public.version_branches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    branch_name character varying(255) NOT NULL,
    description text,
    base_version_id uuid,
    parent_branch_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    status character varying(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'closed', 'deleted')),
    merge_target_branch_id uuid,
    merged_at timestamp with time zone,
    merged_by uuid,
    merge_commit_message text,
    is_default boolean NOT NULL DEFAULT false,
    protection_rules jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    
    -- Primary key
    CONSTRAINT version_branches_pkey PRIMARY KEY (id),
    
    -- Foreign key constraints
    CONSTRAINT version_branches_document_id_fkey 
        FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE,
    CONSTRAINT version_branches_base_version_id_fkey 
        FOREIGN KEY (base_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL,
    CONSTRAINT version_branches_parent_branch_id_fkey 
        FOREIGN KEY (parent_branch_id) REFERENCES public.version_branches(id) ON DELETE SET NULL,
    CONSTRAINT version_branches_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT,
    CONSTRAINT version_branches_merge_target_branch_id_fkey 
        FOREIGN KEY (merge_target_branch_id) REFERENCES public.version_branches(id) ON DELETE SET NULL,
    CONSTRAINT version_branches_merged_by_fkey 
        FOREIGN KEY (merged_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Unique constraints
    CONSTRAINT version_branches_document_branch_unique 
        UNIQUE (document_id, branch_name),
    
    -- Check constraints
    CONSTRAINT version_branches_branch_name_valid 
        CHECK (branch_name ~ '^[a-zA-Z0-9_-]+$' AND char_length(branch_name) >= 1 AND char_length(branch_name) <= 255),
    CONSTRAINT version_branches_merge_consistency 
        CHECK ((status = 'merged' AND merged_at IS NOT NULL AND merged_by IS NOT NULL) 
               OR (status != 'merged' AND merged_at IS NULL AND merged_by IS NULL))
);

-- Indexes for better performance
CREATE INDEX idx_version_branches_document_id ON public.version_branches(document_id);
CREATE INDEX idx_version_branches_created_by ON public.version_branches(created_by);
CREATE INDEX idx_version_branches_status ON public.version_branches(status);
CREATE INDEX idx_version_branches_created_at ON public.version_branches(created_at DESC);
CREATE INDEX idx_version_branches_base_version ON public.version_branches(base_version_id);
CREATE INDEX idx_version_branches_parent_branch ON public.version_branches(parent_branch_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_version_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_version_branches_updated_at
    BEFORE UPDATE ON public.version_branches
    FOR EACH ROW
    EXECUTE FUNCTION update_version_branches_updated_at();

-- Row Level Security (RLS)
ALTER TABLE public.version_branches ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view branches for documents they own or have access to
CREATE POLICY "Users can view version branches for accessible documents" 
ON public.version_branches FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.id = version_branches.document_id 
        AND d.user_id = auth.uid()
    )
);

-- Policy: Users can create branches for documents they own
CREATE POLICY "Users can create version branches for their documents" 
ON public.version_branches FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.id = document_id 
        AND d.user_id = auth.uid()
    )
    AND created_by = auth.uid()
);

-- Policy: Users can update branches they created for their documents
CREATE POLICY "Users can update their version branches" 
ON public.version_branches FOR UPDATE 
USING (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.id = document_id 
        AND d.user_id = auth.uid()
    )
);

-- Policy: Users can delete branches they created for their documents
CREATE POLICY "Users can delete their version branches" 
ON public.version_branches FOR DELETE 
USING (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.documents d 
        WHERE d.id = document_id 
        AND d.user_id = auth.uid()
    )
);

-- Comments for documentation
COMMENT ON TABLE public.version_branches IS 'Stores document version branches for collaborative editing workflows';
COMMENT ON COLUMN public.version_branches.document_id IS 'Reference to the document this branch belongs to';
COMMENT ON COLUMN public.version_branches.branch_name IS 'Human-readable name for the branch (must be unique per document)';
COMMENT ON COLUMN public.version_branches.description IS 'Optional description of what this branch is for';
COMMENT ON COLUMN public.version_branches.base_version_id IS 'The document version this branch was created from';
COMMENT ON COLUMN public.version_branches.parent_branch_id IS 'Parent branch if this is a sub-branch';
COMMENT ON COLUMN public.version_branches.status IS 'Current status: active, merged, closed, or deleted';
COMMENT ON COLUMN public.version_branches.merge_target_branch_id IS 'Branch this was merged into (if status is merged)';
COMMENT ON COLUMN public.version_branches.protection_rules IS 'JSON configuration for branch protection rules';
COMMENT ON COLUMN public.version_branches.metadata IS 'Additional branch metadata and settings';

-- Create default main branch for existing documents
INSERT INTO public.version_branches (document_id, branch_name, description, created_by, is_default)
SELECT 
    d.id as document_id,
    'main' as branch_name,
    'Default main branch' as description,
    d.user_id as created_by,
    true as is_default
FROM public.documents d
WHERE NOT EXISTS (
    SELECT 1 FROM public.version_branches vb 
    WHERE vb.document_id = d.id 
    AND vb.branch_name = 'main'
)
ON CONFLICT (document_id, branch_name) DO NOTHING;