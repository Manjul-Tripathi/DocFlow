import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { EnhancedShareLink, CreateShareLinkParams } from '@/types/shareLink';

import {
  loadShareLinksFromStorage,
  saveShareLinksToStorage
} from '@/utils/shareLinkStorage';

export function useShareLinks(resourceId?: string, resourceType?: string) {
  const [links, setLinks] = useState<EnhancedShareLink[]>(() => loadShareLinksFromStorage());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const initialFetchDone = useRef(false);

  // Save to localStorage whenever links change
  useEffect(() => {
    saveShareLinksToStorage(links);
  }, [links]);

  // Sync from localStorage when tab becomes visible or storage changes
  useEffect(() => {
    const syncFromStorage = () => {
      const storedLinks = loadShareLinksFromStorage();
      // Only update if there are actual changes
      if (JSON.stringify(storedLinks) !== JSON.stringify(links)) {
        setLinks(storedLinks);
      }
    };

    // Listen for storage events from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      // Check for both storage keys just in case
      if (e.key === 'share_links_cache') {
        syncFromStorage();
      }
    };

    // Listen for visibility change (when user returns to this tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFromStorage();
      }
    };

    // Listen for focus (when user clicks back on this window)
    const handleFocus = () => {
      syncFromStorage();
    };

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [links]);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      // First, reload from localStorage to get any updates
      const currentLocalLinks = loadShareLinksFromStorage();
      setLinks(currentLocalLinks);

      let query = supabase.from('external_shares').select('*');
      if (resourceId) query = query.eq('resource_id', resourceId);
      if (resourceType) query = query.eq('resource_type', resourceType);
      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        // Merge database links with local links (prefer database)
        setLinks(prevLinks => {
          const dbIds = new Set(data.map((d: any) => d.id));
          const localOnly = prevLinks.filter(l => !dbIds.has(l.id));
          return [...data, ...localOnly];
        });
      }
      // If error or no data, keep existing local links
    } catch (err) {
      console.warn('Failed to fetch from database, using local data:', err);
    } finally {
      setLoading(false);
    }
  }, [resourceId, resourceType]);

  // Fetch on mount (only once)
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchLinks();
    }
  }, [fetchLinks]);

  const createLink = useCallback(async (params: CreateShareLinkParams): Promise<EnhancedShareLink | null> => {
    setLoading(true);
    try {
      const newLink: EnhancedShareLink = {
        id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resource_type: params.resource_type,
        resource_id: params.resource_id,
        resource_name: params.resource_name,
        token: Math.random().toString(36).substring(2, 12),
        short_code: Math.random().toString(36).substring(2, 7),
        permission: params.permission,
        allow_download: params.allow_download ?? params.permission === 'download',
        allow_print: params.allow_print ?? false,
        allow_copy: params.allow_copy ?? false,
        password_protected: !!params.password,
        password_hash: params.password, // In a real app, this should be hashed securely
        require_email: params.require_email ?? false,
        require_name: params.require_name ?? false,
        allowed_emails: params.allowed_emails,
        allowed_domains: params.allowed_domains,
        blocked_emails: params.blocked_emails,
        max_uses: params.max_uses,
        use_count: 0,
        expires_at: params.expires_in_hours
          ? new Date(Date.now() + params.expires_in_hours * 60 * 60 * 1000).toISOString()
          : undefined,
        notify_on_access: params.notify_on_access ?? false,
        track_views: true,
        watermark_enabled: params.watermark_enabled ?? false,
        watermark_text: params.watermark_text,
        watermark_text: params.watermark_text,
        download_count: 0,
        unique_visitor_ids: [],
        name: params.name,
        created_by: user?.id || 'anonymous',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true
      };

      // Try to save to database
      try {
        const { error } = await supabase
          .from('external_shares')
          .insert(newLink);

        if (error) {
          console.warn('Database insert failed, saving locally only:', error);
        }
      } catch (dbErr) {
        console.warn('Database unavailable, saving locally:', dbErr);
      }

      // Always update local state
      setLinks(prev => [newLink, ...prev]);

      toast({
        title: 'Link created',
        description: 'Share link has been created successfully'
      });
      return newLink;
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updateLink = useCallback(async (
    linkId: string,
    updates: Partial<EnhancedShareLink>
  ): Promise<boolean> => {
    const originalLink = links.find(l => l.id === linkId);

    try {
      // Optimistic update
      setLinks(prev => prev.map(link =>
        link.id === linkId
          ? { ...link, ...updates, updated_at: new Date().toISOString() }
          : link
      ));

      // Try to update database
      try {
        await supabase
          .from('external_shares')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', linkId);
      } catch (dbErr) {
        console.warn('Database update failed:', dbErr);
      }

      toast({
        title: 'Link updated',
        description: 'Share link settings have been updated'
      });
      return true;
    } catch (err) {
      // Rollback
      if (originalLink) {
        setLinks(prev => prev.map(link =>
          link.id === linkId ? originalLink : link
        ));
      }
      toast({
        title: 'Error',
        description: 'Failed to update share link',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, links]);

  const revokeLink = useCallback(async (linkId: string): Promise<boolean> => {
    const originalLink = links.find(l => l.id === linkId);

    try {
      // Optimistic update - immediately update local state
      setLinks(prev => prev.map(link =>
        link.id === linkId
          ? { ...link, is_active: false, updated_at: new Date().toISOString() }
          : link
      ));

      // Try to update database
      try {
        await supabase
          .from('external_shares')
          .update({
            is_active: false,
            status: 'revoked',
            updated_at: new Date().toISOString()
          })
          .eq('id', linkId);
      } catch (dbErr) {
        console.warn('Database update failed:', dbErr);
      }

      toast({
        title: 'Link revoked',
        description: 'Share link has been disabled'
      });
      return true;
    } catch (err) {
      // Rollback on error
      if (originalLink) {
        setLinks(prev => prev.map(link =>
          link.id === linkId ? originalLink : link
        ));
      }
      toast({
        title: 'Error',
        description: 'Failed to revoke share link',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, links]);

  const reactivateLink = useCallback(async (linkId: string): Promise<boolean> => {
    const originalLink = links.find(l => l.id === linkId);

    try {
      // Optimistic update
      setLinks(prev => prev.map(link =>
        link.id === linkId
          ? { ...link, is_active: true, updated_at: new Date().toISOString() }
          : link
      ));

      // Try to update database
      try {
        await supabase
          .from('external_shares')
          .update({
            is_active: true,
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', linkId);
      } catch (dbErr) {
        console.warn('Database update failed:', dbErr);
      }

      toast({
        title: 'Link reactivated',
        description: 'Share link has been enabled'
      });
      return true;
    } catch (err) {
      if (originalLink) {
        setLinks(prev => prev.map(link =>
          link.id === linkId ? originalLink : link
        ));
      }
      toast({
        title: 'Error',
        description: 'Failed to reactivate share link',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, links]);

  const deleteLink = useCallback(async (linkId: string): Promise<boolean> => {
    const originalLinks = [...links];

    try {
      // Optimistic delete
      setLinks(prev => prev.filter(link => link.id !== linkId));

      // Try to delete from database
      try {
        await supabase
          .from('external_shares')
          .delete()
          .eq('id', linkId);
      } catch (dbErr) {
        console.warn('Database delete failed:', dbErr);
      }

      toast({
        title: 'Link deleted',
        description: 'Share link has been permanently deleted'
      });
      return true;
    } catch (err) {
      // Rollback
      setLinks(originalLinks);
      toast({
        title: 'Error',
        description: 'Failed to delete share link',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, links]);

  const duplicateLink = useCallback(async (linkId: string): Promise<EnhancedShareLink | null> => {
    const original = links.find(l => l.id === linkId);
    if (!original) return null;

    const duplicate: EnhancedShareLink = {
      ...original,
      id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      token: Math.random().toString(36).substring(2, 12),
      short_code: Math.random().toString(36).substring(2, 7),
      name: original.name ? `${original.name} (copy)` : 'Copy',
      use_count: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_accessed_at: undefined,
      analytics: undefined
    };

    // Try to save to database
    try {
      await supabase
        .from('external_shares')
        .insert(duplicate);
    } catch (dbErr) {
      console.warn('Database insert failed:', dbErr);
    }

    setLinks(prev => [duplicate, ...prev]);
    toast({
      title: 'Link duplicated',
      description: 'A copy of the share link has been created'
    });
    return duplicate;
  }, [links, toast]);

  // Increment view count for a link
  const incrementViewCount = useCallback(async (linkId: string): Promise<boolean> => {
    try {
      // Optimistic update - immediately update local state
      setLinks(prev => prev.map(link =>
        link.id === linkId
          ? {
            ...link,
            use_count: link.use_count + 1,
            last_accessed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          : link
      ));

      // Try to update database
      try {
        await supabase
          .from('external_shares')
          .update({
            last_accessed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', linkId);

        // Also try to increment using RPC if available
        await supabase.rpc('increment_view_count', { share_id: linkId });
      } catch (dbErr) {
        console.log('Database update for view count failed, using local only');
      }

      return true;
    } catch (err) {
      console.error('Failed to increment view count:', err);
      return false;
    }
  }, []);

  // Get total views across all links
  const totalViews = links.reduce((sum, l) => sum + (l.use_count || 0), 0);

  // Filter functions for different categories
  const getActiveLinks = useCallback(() => {
    return links.filter(l => l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date()));
  }, [links]);

  const getExpiredLinks = useCallback(() => {
    return links.filter(l => l.is_active && l.expires_at && new Date(l.expires_at) <= new Date());
  }, [links]);

  const getRevokedLinks = useCallback(() => {
    return links.filter(l => !l.is_active);
  }, [links]);

  return {
    links,
    loading,
    totalViews,
    activeLinks: getActiveLinks(),
    expiredLinks: getExpiredLinks(),
    revokedLinks: getRevokedLinks(),
    createLink,
    updateLink,
    revokeLink,
    reactivateLink,
    deleteLink,
    duplicateLink,
    incrementViewCount,
    refreshLinks: fetchLinks
  };
}
