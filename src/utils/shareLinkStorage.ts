import { EnhancedShareLink } from '@/types/shareLink';

// Local storage key for persisting links
const STORAGE_KEY = 'share_links_cache';
const VISITOR_ID_KEY = 'share_links_visitor_id';

// Generate or get a unique visitor ID
export const getVisitorId = (): string => {
    try {
        let visitorId = localStorage.getItem(VISITOR_ID_KEY);
        if (!visitorId) {
            visitorId = `visitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem(VISITOR_ID_KEY, visitorId);
        }
        return visitorId;
    } catch {
        // Fallback for when localStorage is not available
        return `visitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
};

// Helper to load from localStorage
export const loadShareLinksFromStorage = (): EnhancedShareLink[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const links = stored ? JSON.parse(stored) : [];
        // Ensure all links have the new tracking fields
        return links.map((link: any) => ({
            ...link,
            download_count: link.download_count ?? 0,
            unique_visitor_ids: link.unique_visitor_ids ?? []
        }));
    } catch {
        return [];
    }
};

// Helper to save to localStorage
export const saveShareLinksToStorage = (links: EnhancedShareLink[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    } catch (e) {
        console.warn('Failed to save links to localStorage:', e);
    }
};

// Increment view count for a link by ID
export const incrementShareLinkViewCount = (linkId: string): boolean => {
    try {
        const visitorId = getVisitorId();
        const links = loadShareLinksFromStorage();
        const updatedLinks = links.map(link => {
            if (link.id === linkId) {
                const uniqueVisitors = link.unique_visitor_ids || [];
                const isNewVisitor = !uniqueVisitors.includes(visitorId);

                return {
                    ...link,
                    use_count: link.use_count + 1,
                    unique_visitor_ids: isNewVisitor ? [...uniqueVisitors, visitorId] : uniqueVisitors,
                    last_accessed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            }
            return link;
        });
        saveShareLinksToStorage(updatedLinks);
        return true;
    } catch (err) {
        console.error('Failed to increment view count:', err);
        return false;
    }
};

// Increment view count for a link by token
export const incrementShareLinkViewCountByToken = (token: string): boolean => {
    try {
        const visitorId = getVisitorId();
        const links = loadShareLinksFromStorage();
        const updatedLinks = links.map(link => {
            if (link.token === token) {
                const uniqueVisitors = link.unique_visitor_ids || [];
                const isNewVisitor = !uniqueVisitors.includes(visitorId);

                return {
                    ...link,
                    use_count: link.use_count + 1,
                    unique_visitor_ids: isNewVisitor ? [...uniqueVisitors, visitorId] : uniqueVisitors,
                    last_accessed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            }
            return link;
        });
        saveShareLinksToStorage(updatedLinks);
        return true;
    } catch (err) {
        console.error('Failed to increment view count by token:', err);
        return false;
    }
};

// Increment download count for a link by token
export const incrementDownloadCountByToken = (token: string): boolean => {
    try {
        const links = loadShareLinksFromStorage();
        const updatedLinks = links.map(link => {
            if (link.token === token) {
                return {
                    ...link,
                    download_count: (link.download_count || 0) + 1,
                    updated_at: new Date().toISOString()
                };
            }
            return link;
        });
        saveShareLinksToStorage(updatedLinks);
        return true;
    } catch (err) {
        console.error('Failed to increment download count:', err);
        return false;
    }
};

// Increment download count for a link by ID
export const incrementDownloadCount = (linkId: string): boolean => {
    try {
        const links = loadShareLinksFromStorage();
        const updatedLinks = links.map(link => {
            if (link.id === linkId) {
                return {
                    ...link,
                    download_count: (link.download_count || 0) + 1,
                    updated_at: new Date().toISOString()
                };
            }
            return link;
        });
        saveShareLinksToStorage(updatedLinks);
        return true;
    } catch (err) {
        console.error('Failed to increment download count:', err);
        return false;
    }
};

// Get a share link by token
export const getShareLinkByToken = (token: string): EnhancedShareLink | null => {
    const links = loadShareLinksFromStorage();
    const link = links.find(l => l.token === token);
    if (link) {
        // Ensure tracking fields exist
        return {
            ...link,
            download_count: link.download_count ?? 0,
            unique_visitor_ids: link.unique_visitor_ids ?? []
        };
    }
    return null;
};

// Check if a share link is valid (active, not expired)
export const isShareLinkValid = (link: EnhancedShareLink): { valid: boolean; reason?: string } => {
    if (!link.is_active) {
        return { valid: false, reason: 'This share link has been revoked' };
    }
    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
        return { valid: false, reason: 'This share link has expired' };
    }
    if (link.max_uses && link.use_count >= link.max_uses) {
        return { valid: false, reason: 'This share link has reached its maximum views' };
    }
    return { valid: true };
};

// Get analytics for a link
export const getShareLinkAnalytics = (link: EnhancedShareLink) => {
    const uniqueVisitors = (link.unique_visitor_ids || []).length;
    const accessLogs = getAccessLogsForLink(link.id);

    return {
        total_views: link.use_count || 0,
        unique_visitors: uniqueVisitors,
        download_count: link.download_count || 0,
        avg_view_duration_seconds: 120, // Placeholder - would need actual session tracking
        views_by_date: [],
        views_by_country: [],
        views_by_device: [
            { device: 'Desktop', views: Math.floor((link.use_count || 0) * 0.6) },
            { device: 'Mobile', views: Math.floor((link.use_count || 0) * 0.3) },
            { device: 'Tablet', views: Math.floor((link.use_count || 0) * 0.1) }
        ],
        recent_accesses: accessLogs
    };
};

// ============= Access Log Storage =============

const ACCESS_LOGS_KEY = 'share_links_access_logs';

export interface AccessLogEntry {
    id: string;
    link_id: string;
    accessed_at: string;
    accessor_email?: string;
    action: 'view' | 'download' | 'print';
    device_type?: string;
    user_agent?: string;
}

// Load access logs from localStorage
export const loadAccessLogs = (): AccessLogEntry[] => {
    try {
        const stored = localStorage.getItem(ACCESS_LOGS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

// Save access logs to localStorage
export const saveAccessLogs = (logs: AccessLogEntry[]) => {
    try {
        // Keep only last 100 logs to avoid storage bloat
        const trimmedLogs = logs.slice(-100);
        localStorage.setItem(ACCESS_LOGS_KEY, JSON.stringify(trimmedLogs));
    } catch (e) {
        console.warn('Failed to save access logs:', e);
    }
};

// Add a new access log entry
export const logAccess = (linkId: string, accessorEmail?: string, action: 'view' | 'download' | 'print' = 'view'): void => {
    try {
        const logs = loadAccessLogs();
        const newLog: AccessLogEntry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            link_id: linkId,
            accessed_at: new Date().toISOString(),
            accessor_email: accessorEmail,
            action,
            device_type: detectDeviceType(),
            user_agent: navigator.userAgent
        };
        logs.push(newLog);
        saveAccessLogs(logs);
    } catch (err) {
        console.error('Failed to log access:', err);
    }
};

// Get access logs for a specific link
export const getAccessLogsForLink = (linkId: string): AccessLogEntry[] => {
    const logs = loadAccessLogs();
    return logs
        .filter(log => log.link_id === linkId)
        .sort((a, b) => new Date(b.accessed_at).getTime() - new Date(a.accessed_at).getTime());
};

// Detect device type from user agent
const detectDeviceType = (): string => {
    if (typeof navigator === 'undefined') return 'Desktop';

    const ua = navigator.userAgent;

    // Check for tablets first (more specific patterns)
    if (/iPad|Android(?!.*Mobile)|PlayBook|Tablet/i.test(ua)) {
        return 'Tablet';
    }

    // Check for mobile devices
    if (/Mobile|iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Opera Mobi|Windows Phone/i.test(ua)) {
        return 'Mobile';
    }

    // Default to Desktop
    return 'Desktop';
};
