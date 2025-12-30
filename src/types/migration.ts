export type SourceSystem = 'google_drive' | 'onedrive' | 'filenet';

export type MigrationJobStatus =
  | 'pending'
  | 'discovering'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MigrationItemStatus =
  | 'pending'
  | 'discovered'
  | 'downloading'
  | 'uploading'
  | 'indexing'
  | 'applying_permissions'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'skipped';

export type MigrationStage =
  | 'discovery'
  | 'pre_check'
  | 'transfer'
  | 'index'
  | 'acl_apply'
  | 'verify'
  | 'finalize';

export interface MigrationJob {
  id: string;
  user_id: string;
  name: string;
  source_system: SourceSystem;
  status: MigrationJobStatus;
  config: MigrationConfig;
  source_credentials_id?: string;
  total_items: number;
  processed_items: number;
  failed_items: number;
  skipped_items: number;
  total_bytes: number;
  transferred_bytes: number;
  started_at?: string;
  completed_at?: string;
  last_checkpoint?: MigrationCheckpoint;
  error_summary?: ErrorSummary;
  created_at: string;
  updated_at: string;
}

export interface MigrationConfig {
  source_folder_id?: string;
  source_folder_path?: string;
  target_folder_id?: string;
  include_subfolders: boolean;
  include_permissions: boolean;
  include_versions: boolean;
  duplicate_policy: 'keep_both' | 'dedupe_checksum' | 'version_it' | 'skip';
  file_size_limit_mb?: number;
  excluded_extensions?: string[];
  dry_run: boolean;
  concurrency: number;
  retry_attempts: number;
  delta_mode: boolean;
}

export interface MigrationCheckpoint {
  last_page_token?: string;
  last_processed_item_id?: string;
  current_folder_id?: string;
  processed_folders: string[];
  checkpoint_at: string;
}

export interface ErrorSummary {
  total_errors: number;
  by_category: Record<string, number>;
  sample_errors: Array<{
    item_id: string;
    error_code: string;
    message: string;
  }>;
}

export interface MigrationItem {
  id: string;
  job_id: string;
  source_item_id: string;
  source_path?: string;
  source_name: string;
  source_mime_type?: string;
  source_size?: number;
  source_checksum?: string;
  source_created_at?: string;
  source_modified_at?: string;
  source_etag?: string;
  source_version?: string;
  source_metadata: Record<string, any>;
  source_permissions: SourcePermission[];
  item_type: 'file' | 'folder';
  parent_source_id?: string;
  target_document_id?: string;
  target_folder_id?: string;
  status: MigrationItemStatus;
  stage: MigrationStage;
  attempt_count: number;
  last_error?: string;
  error_code?: string;
  checksum_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourcePermission {
  principal_id: string;
  principal_type: 'user' | 'group' | 'domain' | 'anyone';
  email?: string;
  display_name?: string;
  role: string;
  inherited: boolean;
}

export interface MigrationMapping {
  id: string;
  user_id: string;
  source_system: SourceSystem;
  source_item_id: string;
  source_path?: string;
  target_document_id?: string;
  target_folder_id?: string;
  created_at: string;
}

export interface IdentityMapping {
  id: string;
  user_id: string;
  source_system: SourceSystem;
  source_principal_id: string;
  source_principal_type: 'user' | 'group' | 'domain' | 'anyone';
  source_email?: string;
  source_display_name?: string;
  target_user_id?: string;
  target_group_id?: string;
  role_mapping: RoleMapping;
  is_verified: boolean;
  fallback_action: 'owner_only' | 'skip' | 'report';
  created_at: string;
  updated_at: string;
}

export interface RoleMapping {
  [sourceRole: string]: string;
}

export interface MigrationCredentials {
  id: string;
  user_id: string;
  name: string;
  source_system: SourceSystem;
  credentials_encrypted: Record<string, any>;
  is_valid: boolean;
  last_validated_at?: string;
  scopes?: string[];
  created_at: string;
  updated_at: string;
}

export interface MigrationMetrics {
  id: string;
  job_id: string;
  recorded_at: string;
  files_per_minute?: number;
  bytes_per_second?: number;
  api_throttle_count: number;
  error_count: number;
  queue_backlog: number;
  stage_counts: Record<MigrationStage, number>;
}

export interface MigrationAuditLog {
  id: string;
  job_id?: string;
  item_id?: string;
  event_type: string;
  stage?: string;
  details: Record<string, any>;
  error_message?: string;
  source_system?: string;
  source_item_id?: string;
  created_at: string;
}

// Connector interfaces
export interface ConnectorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  retry_after?: number;
}

export interface DiscoveryResult {
  items: DiscoveredItem[];
  next_page_token?: string;
  has_more: boolean;
}

export interface DiscoveredItem {
  id: string;
  name: string;
  path: string;
  mime_type?: string;
  size?: number;
  created_at?: string;
  modified_at?: string;
  etag?: string;
  version?: string;
  parent_id?: string;
  is_folder: boolean;
  checksum?: string;
  metadata?: Record<string, any>;
  permissions?: SourcePermission[];
}

export interface StreamedContent {
  stream: ReadableStream<Uint8Array>;
  size: number;
  checksum?: string;
  mime_type?: string;
}

// Role mapping defaults
export const GOOGLE_DRIVE_ROLE_MAP: RoleMapping = {
  'owner': 'owner',
  'organizer': 'editor',
  'fileOrganizer': 'editor',
  'writer': 'editor',
  'commenter': 'commenter',
  'reader': 'viewer'
};

export const ONEDRIVE_ROLE_MAP: RoleMapping = {
  'owner': 'owner',
  'write': 'editor',
  'read': 'viewer'
};

export const FILENET_ROLE_MAP: RoleMapping = {
  'full_control': 'owner',
  'modify': 'editor',
  'read': 'viewer',
  'view_properties': 'viewer'
};
