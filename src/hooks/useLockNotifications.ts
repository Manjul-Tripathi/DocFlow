import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface LockNotification {
  id: string;
  document_id: string;
  lock_id: string;
  notified_user_id: string;
  notification_type: 'lock_acquired' | 'lock_released' | 'lock_expired' | 'force_unlock' | 'ownership_transferred' | 'access_requested' | 'share_accessed';
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export function useLockNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<LockNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return Promise.resolve();
    }

    try {
      const { data, error } = await supabase
        .from('lock_notifications')
        .select('*')
        .eq('notified_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data || []);
      const newUnreadCount = (data || []).filter(n => !n.is_read).length;
      setUnreadCount(newUnreadCount);
      console.log('📧 Fetched notifications:', data?.length, 'Unread:', newUnreadCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to load notifications',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('lock_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      console.log('📧 Marking all notifications as read...');
      const { data, error } = await supabase
        .from('lock_notifications')
        .update({ is_read: true })
        .eq('notified_user_id', user.id)
        .eq('is_read', false)
        .select();

      if (error) throw error;

      console.log('📧 Marked as read:', data?.length, 'notifications');

      // Update local state immediately
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );

      // Force unread count to 0
      setUnreadCount(0);

      // Refetch to ensure sync with database
      await fetchNotifications();

      console.log('📧 Refetch complete, new unread count should be 0');

      toast({
        title: 'All notifications marked as read',
      });
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark notifications as read',
        variant: 'destructive'
      });
    }
  }, [user, toast, fetchNotifications]);

  const requestAccess = useCallback(async (documentId: string, message?: string) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Call backend API endpoint
      const response = await fetch('http://localhost:8000/api/v1/checkinout/request-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: documentId,
          message: message || 'Requesting access to this document',
          user_id: user.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to send request');
      }

      toast({
        title: 'Access Request Sent',
        description: 'The document owner will be notified of your request'
      });

      return true;
    } catch (error: any) {
      console.error('Error requesting access:', error);
      toast({
        title: 'Request Failed',
        description: error.message || 'Failed to send access request',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const channel = supabase
      .channel('lock_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lock_notifications',
          filter: `notified_user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotification = payload.new as LockNotification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Show toast notification for access-related notifications
          if (newNotification.notification_type === 'access_requested' || newNotification.notification_type === 'share_accessed') {
            toast({
              title: '🔔 Share Link Accessed',
              description: newNotification.message || 'Someone accessed your shared link'
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications, toast]);

  return {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    requestAccess
  };
}
