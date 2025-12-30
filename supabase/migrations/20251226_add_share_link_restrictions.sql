-- ============= ADD SHARE LINK RESTRICTION COLUMNS =============
-- This migration adds columns for email/domain restrictions and access notifications

-- Add allowed_emails array column (list of specific emails allowed to access)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS allowed_emails TEXT[];

-- Add allowed_domains array column (list of domains allowed to access, e.g., 'company.com')
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS allowed_domains TEXT[];

-- Add blocked_emails array column (for blocking specific emails if needed)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS blocked_emails TEXT[];

-- Add notify_on_access column (send notification when link is accessed)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS notify_on_access BOOLEAN DEFAULT false;

-- Add require_email column (require visitor to enter email before viewing)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS require_email BOOLEAN DEFAULT false;

-- Add require_name column (require visitor to enter name before viewing)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS require_name BOOLEAN DEFAULT false;

-- Add watermark_enabled column
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT false;

-- Add watermark_text column
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS watermark_text TEXT;

-- Add allow_copy column (allow copying text from document)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS allow_copy BOOLEAN DEFAULT true;

-- Add token column (short token used for share links)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS token TEXT;

-- Add short_code column (shorter code for URLs)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Add name column (friendly name for the share link)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS name TEXT;

-- Add description column
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS description TEXT;

-- Add download_count column
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

-- Add unique_visitor_ids array column for tracking unique visitors
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS unique_visitor_ids TEXT[];

-- Add use_count column (same as view_count but for compatibility)
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0;

-- Add is_active column
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add track_views column
ALTER TABLE public.external_shares ADD COLUMN IF NOT EXISTS track_views BOOLEAN DEFAULT true;

-- Create index on token for faster lookups
CREATE INDEX IF NOT EXISTS idx_external_shares_token ON public.external_shares(token);

-- Migration complete
COMMENT ON COLUMN public.external_shares.allowed_emails IS 'Array of specific email addresses allowed to access this share';
COMMENT ON COLUMN public.external_shares.allowed_domains IS 'Array of email domains allowed to access (e.g., company.com)';
COMMENT ON COLUMN public.external_shares.notify_on_access IS 'Send email notification to owner when share is accessed';
