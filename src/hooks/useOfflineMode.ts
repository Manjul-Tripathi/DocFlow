import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  initOfflineDB,
  saveDocumentOffline,
  getAllOfflineDocuments,
  deleteOfflineDocument,
  getOfflineStorageStats,
  addToSyncQueue,
  getPendingSyncItems,
  removeSyncItem,
  updateSyncItemStatus,
  clearAllOfflineData,
  toggleDocumentFavorite,
} from '@/services/offlineStorage';

interface OfflineStatus {
  isOnline: boolean;
  isInitialized: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  offlineDocumentCount: number;
  totalOfflineSize: number;
  lastSyncAt: string | null;
}

export const useOfflineMode = () => {
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: navigator.onLine,
    isInitialized: false,
    isSyncing: false,
    pendingSyncCount: 0,
    offlineDocumentCount: 0,
    totalOfflineSize: 0,
    lastSyncAt: null,
  });
  const { toast } = useToast();

  // Initialize offline database
  useEffect(() => {
    const init = async () => {
      try {
        await initOfflineDB();
        const stats = await getOfflineStorageStats();
        setStatus(prev => ({
          ...prev,
          isInitialized: true,
          offlineDocumentCount: stats.documentCount,
          totalOfflineSize: stats.totalSize,
          pendingSyncCount: stats.pendingSyncs,
        }));
      } catch (error) {
        console.error('Failed to initialize offline database:', error);
      }
    };

    init();
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      toast({
        title: "You're back online",
        description: "Syncing your changes...",
      });
      syncPendingChanges();
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
      toast({
        title: "You're offline",
        description: "Changes will be synced when you're back online",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Refresh stats
  const refreshStats = useCallback(async () => {
    const stats = await getOfflineStorageStats();
    setStatus(prev => ({
      ...prev,
      offlineDocumentCount: stats.documentCount,
      totalOfflineSize: stats.totalSize,
      pendingSyncCount: stats.pendingSyncs,
    }));
  }, []);

  // Download document for offline access
  const makeDocumentAvailableOffline = useCallback(async (document: {
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
    updated_at: string;
    extracted_text: string;
    processing_status: string;
    metadata: any;
    storage_url?: string | null;
  }) => {
    try {
      console.log('📥 Making document available offline:', {
        id: document.id,
        file_name: document.file_name,
        storage_url: document.storage_url
      });

      let blob: Blob | undefined;

      // Download the file blob if there's a storage URL
      if (document.storage_url) {
        try {
          console.log('⬇️ Downloading blob from:', document.storage_url);
          const response = await fetch(document.storage_url);
          console.log('📡 Fetch response:', {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type')
          });
          
          if (response.ok) {
            blob = await response.blob();
            console.log('✅ Blob downloaded:', {
              size: blob.size,
              type: blob.type
            });
          } else {
            console.warn('❌ Failed to download blob:', response.status, response.statusText);
          }
        } catch (error) {
          console.error('❌ Error downloading file for offline access:', error);
        }
      } else {
        console.warn('⚠️ No storage_url provided for document');
      }

      await saveDocumentOffline(document, blob);
      await refreshStats();

      toast({
        title: "Available offline",
        description: `${document.file_name} is now available offline`,
      });

      return true;
    } catch (error) {
      console.error('Failed to save document offline:', error);
      toast({
        title: "Failed to save offline",
        description: "Could not make document available offline",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, refreshStats]);

  // Remove document from offline storage
  const removeDocumentFromOffline = useCallback(async (documentId: string) => {
    try {
      await deleteOfflineDocument(documentId);
      await refreshStats();

      toast({
        title: "Removed from offline",
        description: "Document removed from offline storage",
      });

      return true;
    } catch (error) {
      console.error('Failed to remove document from offline:', error);
      return false;
    }
  }, [toast, refreshStats]);

  // Get all offline documents
  const getOfflineDocuments = useCallback(async () => {
    try {
      return await getAllOfflineDocuments();
    } catch (error) {
      console.error('Failed to get offline documents:', error);
      return [];
    }
  }, []);

  // Toggle document favorite
  const toggleOfflineFavorite = useCallback(async (documentId: string) => {
    try {
      await toggleDocumentFavorite(documentId);
      return true;
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      return false;
    }
  }, []);

  // Queue an operation for sync
  const queueForSync = useCallback(async (
    operation: 'create' | 'update' | 'delete',
    table: string,
    data: any
  ) => {
    try {
      await addToSyncQueue(operation, table, data);
      await refreshStats();
    } catch (error) {
      console.error('Failed to queue for sync:', error);
    }
  }, [refreshStats]);

  // Sync pending changes
  const syncPendingChanges = useCallback(async () => {
    if (!status.isOnline || status.isSyncing) return;

    setStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      const pendingItems = await getPendingSyncItems();

      for (const item of pendingItems) {
        try {
          await updateSyncItemStatus(item.id, 'syncing');

          switch (item.operation) {
            case 'create':
              // @ts-ignore
              await supabase.from(item.table).insert(item.data);
              break;
            case 'update':
              // @ts-ignore
              await supabase.from(item.table).update(item.data).eq('id', item.data.id);
              break;
            case 'delete':
              // @ts-ignore
              await supabase.from(item.table).delete().eq('id', item.data.id);
              break;
          }

          await removeSyncItem(item.id);
        } catch (error) {
          console.error('Failed to sync item:', item, error);
          await updateSyncItemStatus(item.id, 'failed', true);
        }
      }

      await refreshStats();
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      }));

      if (pendingItems.length > 0) {
        toast({
          title: "Sync complete",
          description: `${pendingItems.length} changes synced`,
        });
      }
    } catch (error) {
      console.error('Sync failed:', error);
      setStatus(prev => ({ ...prev, isSyncing: false }));
    }
  }, [status.isOnline, status.isSyncing, toast, refreshStats]);

  // Clear all offline data
  const clearOfflineData = useCallback(async () => {
    try {
      await clearAllOfflineData();
      await refreshStats();
      toast({
        title: "Offline data cleared",
        description: "All offline data has been removed",
      });
    } catch (error) {
      console.error('Failed to clear offline data:', error);
    }
  }, [toast, refreshStats]);

  // Check if a document is available offline
  const isDocumentOffline = useCallback(async (documentId: string) => {
    try {
      const documents = await getAllOfflineDocuments();
      return documents.some(doc => doc.id === documentId);
    } catch {
      return false;
    }
  }, []);

  return {
    status,
    makeDocumentAvailableOffline,
    removeDocumentFromOffline,
    getOfflineDocuments,
    toggleOfflineFavorite,
    queueForSync,
    syncPendingChanges,
    clearOfflineData,
    isDocumentOffline,
    refreshStats,
  };
};
