// Document Version Control Types - Best-in-class implementation

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  content: string | Record<string, unknown>;  // Plain text content or structured content
  change_summary?: string;
  created_by?: string;
  version_created_at?: string;
  // Additional computed/joined data
  creator_email?: string;
  // Extended properties used by the application
  major_version?: number;
  minor_version?: number;
  created_at?: string;  // Alias for version_created_at in some contexts
  is_current?: boolean;
  change_type?: 'manual' | 'auto' | 'restore' | 'branch_merge';
  tags?: string[];
  metadata?: Record<string, unknown>;
  file_url?: string;
  file_size?: number;
  file_hash?: string;
  branch_id?: string;
  parent_version_id?: string;
}


export interface DocumentLock {
  id: string;
  document_id: string;
  locked_by: string;
  locked_at: string;
  lock_reason?: string;
  expires_at?: string;
  is_active: boolean;
  // Joined data
  locker_email?: string;
}

export interface VersionBranch {
  id: string;
  document_id: string;
  branch_name: string;
  description?: string;
  parent_branch_id?: string;
  base_version_id?: string;
  created_by?: string;
  created_at: string;
  merged_at?: string;
  merged_into_branch_id?: string;
  status: 'active' | 'merged' | 'archived';
  // Computed
  versions_count?: number;
}

export interface VersionComment {
  id: string;
  version_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  updated_at: string;
  // Joined data
  user_email?: string;
}

export interface LockNotification {
  id: string;
  document_id: string;
  lock_id: string;
  notified_user_id: string;
  notification_type: 'lock_attempt' | 'lock_released' | 'lock_expiring';
  message?: string;
  is_read: boolean;
  created_at: string;
}

export interface AutoVersioningSettings {
  id: string;
  user_id: string;
  document_id?: string;
  is_enabled: boolean;
  interval_seconds: number;
  max_auto_versions: number;
  created_at: string;
  updated_at: string;
}

// Version Diff Types
export interface VersionDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface VersionComparison {
  baseVersion: DocumentVersion;
  compareVersion: DocumentVersion;
  diffs: VersionDiff[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  aiSummary?: string;
}

// Action Types
export interface CreateVersionParams {
  document_id: string;
  content?: Record<string, unknown>;
  file_url?: string;
  file_size?: number;
  file_hash?: string;
  change_summary?: string;
  change_type?: 'manual' | 'auto' | 'restore' | 'branch_merge';
  branch_id?: string;
  parent_version_id?: string;
  tags?: string[];
  is_major?: boolean;
}

export interface RestoreVersionParams {
  version_id: string;
  restore_summary?: string;
}

export interface CreateBranchParams {
  document_id: string;
  branch_name: string;
  description?: string;
  base_version_id: string;
  parent_branch_id?: string;
}

export interface MergeBranchParams {
  source_branch_id: string;
  target_branch_id: string;
  merge_summary?: string;
}

export interface LockDocumentParams {
  document_id: string;
  lock_reason?: string;
  expires_in_minutes?: number;
}

// Context Types
export interface VersionControlState {
  versions: DocumentVersion[];
  currentVersion?: DocumentVersion;
  branches: VersionBranch[];
  activeBranch?: VersionBranch;
  lock?: DocumentLock;
  isLocked: boolean;
  isLockedByCurrentUser: boolean;
  autoVersioning: AutoVersioningSettings | null;
  notifications: LockNotification[];
  isLoading: boolean;
  error: string | null;
}

export interface VersionControlActions {
  createVersion: (params: CreateVersionParams) => Promise<DocumentVersion>;
  restoreVersion: (params: RestoreVersionParams) => Promise<DocumentVersion>;
  deleteVersion: (version_id: string) => Promise<void>;
  createBranch: (params: CreateBranchParams) => Promise<VersionBranch>;
  mergeBranch: (params: MergeBranchParams) => Promise<DocumentVersion>;
  switchBranch: (branch_id: string) => Promise<void>;
  lockDocument: (params: LockDocumentParams) => Promise<DocumentLock>;
  unlockDocument: (document_id: string) => Promise<void>;
  requestLock: (document_id: string) => Promise<void>;
  compareVersions: (version1_id: string, version2_id: string) => Promise<VersionComparison>;
  generateAISummary: (version_id: string) => Promise<string>;
  addComment: (version_id: string, comment: string) => Promise<VersionComment>;
  updateAutoVersioning: (settings: Partial<AutoVersioningSettings>) => Promise<void>;
  refreshVersions: () => Promise<void>;
}
