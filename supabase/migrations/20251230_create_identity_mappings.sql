-- Identity Mappings Table
-- Maps users/groups from source systems (Google Drive, OneDrive, FileNet) to SimplifyDrive users

CREATE TABLE IF NOT EXISTS identity_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source identity info
  source_system TEXT NOT NULL CHECK (source_system IN ('google_drive', 'onedrive', 'filenet')),
  source_principal_id TEXT NOT NULL,
  source_principal_type TEXT NOT NULL CHECK (source_principal_type IN ('user', 'group', 'domain', 'anyone')),
  source_email TEXT,
  source_display_name TEXT,
  
  -- Target identity in SimplifyDrive
  target_user_id UUID REFERENCES auth.users(id),
  target_group_id TEXT,
  
  -- Role mapping (source role -> target role)
  role_mapping JSONB DEFAULT '{}',
  
  -- Status
  is_verified BOOLEAN DEFAULT FALSE,
  fallback_action TEXT DEFAULT 'owner_only' CHECK (fallback_action IN ('owner_only', 'skip', 'report')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate mappings
  UNIQUE (user_id, source_system, source_principal_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_identity_mappings_user_id ON identity_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_mappings_source ON identity_mappings(source_system, source_principal_id);

-- Enable RLS
ALTER TABLE identity_mappings ENABLE ROW LEVEL SECURITY;

-- Users can only access their own identity mappings
CREATE POLICY identity_mappings_user_policy ON identity_mappings 
  FOR ALL USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_identity_mappings_updated_at
  BEFORE UPDATE ON identity_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_migration_updated_at();
