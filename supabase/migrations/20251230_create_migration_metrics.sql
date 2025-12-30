-- Migration Metrics & Audit Log Tables
-- Required for live metrics dashboard functionality

-- ============================================================================
-- Migration Metrics: Store real-time performance metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES migration_jobs(id) ON DELETE CASCADE,
  
  -- Performance metrics
  files_per_minute NUMERIC DEFAULT 0,
  bytes_per_second NUMERIC DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  api_throttle_count INTEGER DEFAULT 0,
  
  -- Stage distribution
  stage_counts JSONB DEFAULT '{}',
  
  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Migration Audit Log: Track events and errors
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES migration_jobs(id) ON DELETE CASCADE,
  
  -- Event info
  event_type TEXT NOT NULL,
  source_item_id TEXT,
  error_message TEXT,
  error_code TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_migration_metrics_job_id ON migration_metrics(job_id);
CREATE INDEX IF NOT EXISTS idx_migration_metrics_recorded_at ON migration_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_audit_log_job_id ON migration_audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_migration_audit_log_created_at ON migration_audit_log(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE migration_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow users to read metrics for jobs they own
CREATE POLICY migration_metrics_select_policy ON migration_metrics 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM migration_jobs 
      WHERE migration_jobs.id = migration_metrics.job_id 
      AND migration_jobs.user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert metrics (backend uses service role which bypasses RLS)
CREATE POLICY migration_metrics_insert_policy ON migration_metrics 
  FOR INSERT WITH CHECK (true);

-- Allow users to read audit logs for jobs they own
CREATE POLICY migration_audit_log_select_policy ON migration_audit_log 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM migration_jobs 
      WHERE migration_jobs.id = migration_audit_log.job_id 
      AND migration_jobs.user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert audit logs
CREATE POLICY migration_audit_log_insert_policy ON migration_audit_log 
  FOR INSERT WITH CHECK (true);
