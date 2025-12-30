-- Google Drive Migration - Database Tables
-- Phase 1: Create tables to track migration jobs and items

-- ============================================================================
-- Migration Jobs: Track overall migration operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'google_drive',
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'discovering', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  config JSONB NOT NULL DEFAULT '{}',
  source_credentials_id UUID,
  
  -- Progress tracking
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  skipped_items INTEGER DEFAULT 0,
  
  -- Size tracking
  total_bytes BIGINT DEFAULT 0,
  transferred_bytes BIGINT DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Migration Items: Track each individual file/folder
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES migration_jobs(id) ON DELETE CASCADE,
  
  -- Source file info (from Google Drive)
  source_item_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_path TEXT,
  source_mime_type TEXT,
  source_size BIGINT,
  item_type TEXT CHECK (item_type IN ('file', 'folder')),
  
  -- Target info (in SimplifyDrive)
  target_document_id UUID REFERENCES documents(id),
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'downloading', 'uploading', 'completed', 'failed', 'skipped')),
  last_error TEXT,
  attempt_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Migration Credentials: Store encrypted Google OAuth tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'google_drive',
  
  -- Encrypted OAuth data
  credentials_encrypted JSONB NOT NULL,
  
  -- Validation
  is_valid BOOLEAN DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_migration_jobs_user_id ON migration_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON migration_jobs(status);
CREATE INDEX IF NOT EXISTS idx_migration_items_job_id ON migration_items(job_id);
CREATE INDEX IF NOT EXISTS idx_migration_items_status ON migration_items(status);
CREATE INDEX IF NOT EXISTS idx_migration_credentials_user_id ON migration_credentials(user_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only access their own migration jobs
CREATE POLICY migration_jobs_user_policy ON migration_jobs 
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own credentials
CREATE POLICY migration_credentials_user_policy ON migration_credentials 
  FOR ALL USING (auth.uid() = user_id);

-- Users can access items if they own the parent job
CREATE POLICY migration_items_user_policy ON migration_items 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM migration_jobs 
      WHERE migration_jobs.id = migration_items.job_id 
      AND migration_jobs.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Trigger to update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_migration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_migration_jobs_updated_at
  BEFORE UPDATE ON migration_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_migration_updated_at();

CREATE TRIGGER update_migration_items_updated_at
  BEFORE UPDATE ON migration_items
  FOR EACH ROW
  EXECUTE FUNCTION update_migration_updated_at();

CREATE TRIGGER update_migration_credentials_updated_at
  BEFORE UPDATE ON migration_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_migration_updated_at();
