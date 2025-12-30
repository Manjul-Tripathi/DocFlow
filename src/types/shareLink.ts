// ============= Enhanced Link Sharing Types =============

export type ShareLinkPermission = 'view' | 'download' | 'edit';

export interface EnhancedShareLink {
  id: string;
  resource_type: 'document' | 'folder' | 'workspace' | 'form';
  resource_id: string;
  resource_name?: string;
  token: string;
  short_code?: string; // Short URL code

  // Permissions
  permission: ShareLinkPermission;
  allow_download: boolean;
  allow_print: boolean;
  allow_copy: boolean;

  // Security
  password_protected: boolean;
  password_hash?: string;
  require_email: boolean;
  require_name: boolean;
  allowed_emails?: string[];
  allowed_domains?: string[];
  blocked_emails?: string[];

  // Limits
  max_uses?: number;
  use_count: number;
  expires_at?: string;

  // Tracking
  notify_on_access: boolean;
  track_views: boolean;
  watermark_enabled: boolean;
  watermark_text?: string;

  // Analytics tracking fields
  download_count: number;
  unique_visitor_ids: string[]; // Array of visitor fingerprints/IDs

  // Metadata
  name?: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  is_active: boolean;

  // Analytics summary
  analytics?: ShareLinkAnalytics;
}

export interface ShareLinkAnalytics {
  total_views: number;
  unique_visitors: number;
  download_count: number;
  avg_view_duration_seconds: number;
  views_by_date: { date: string; views: number }[];
  views_by_country: { country: string; views: number }[];
  views_by_device: { device: string; views: number }[];
  recent_accesses: ShareLinkAccess[];
}

export interface ShareLinkAccess {
  id: string;
  link_id: string;
  accessed_at: string;
  ip_address?: string;
  user_agent?: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  email?: string;
  name?: string;
  duration_seconds?: number;
  downloaded: boolean;
  printed: boolean;
}

export interface CreateShareLinkParams {
  resource_type: EnhancedShareLink['resource_type'];
  resource_id: string;
  resource_name?: string;
  permission: ShareLinkPermission;

  // Options
  name?: string;
  allow_download?: boolean;
  allow_print?: boolean;
  allow_copy?: boolean;

  // Security
  password?: string;
  require_email?: boolean;
  require_name?: boolean;
  allowed_emails?: string[];
  allowed_domains?: string[];
  blocked_emails?: string[];

  // Limits
  max_uses?: number;
  expires_in_hours?: number;

  // Tracking
  notify_on_access?: boolean;
  watermark_enabled?: boolean;
  watermark_text?: string;
}

export const SHARE_LINK_PERMISSION_INFO: Record<ShareLinkPermission, {
  label: string;
  description: string;
  icon: string;
  color: string;
}> = {
  view: {
    label: 'View Only',
    description: 'Can view the document but cannot make changes',
    icon: 'Eye',
    color: 'hsl(var(--chart-1))'
  },
  download: {
    label: 'Can Download',
    description: 'Can view and download a copy',
    icon: 'Download',
    color: 'hsl(var(--chart-2))'
  },
  edit: {
    label: 'Can Edit',
    description: 'Can make changes to the document',
    icon: 'Edit',
    color: 'hsl(var(--chart-3))'
  }
};

export const EXPIRATION_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
  { label: '90 days', hours: 2160 },
  { label: 'Never', hours: 0 }
];

export const generateShareUrl = (token: string, baseUrl?: string): string => {
  const base = baseUrl || window.location.origin;
  return `${base}/s/${token}`;
};

export const generateQRCodeUrl = (url: string, size: number = 200): string => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
};
