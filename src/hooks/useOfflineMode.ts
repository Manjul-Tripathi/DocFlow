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
  queueFileUpload,
  getPendingUploads,
} from '@/services/offlineStorage';

interface OfflineStatus {
  isOnline: boolean;
  isInitialized: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  offlineDocumentCount: number;
  totalOfflineSize: number;
  lastSyncAt: string | null;
  showSyncDialog: boolean;
  pendingUploadCount: number;
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
    showSyncDialog: false,
    pendingUploadCount: 0,
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
    const handleOnline = async () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      
      // Check for pending uploads
      const pendingUploads = await getPendingUploads();
      if (pendingUploads.length > 0) {
        setStatus(prev => ({ 
          ...prev, 
          showSyncDialog: true,
          pendingUploadCount: pendingUploads.length 
        }));
      } else {
        toast({
          title: "You're back online",
          description: "Syncing your changes...",
        });
        syncPendingChanges();
      }
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
      toast({
        title: "You're offline",
        description: "Your uploads will be synced when you're back online",
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
    const pendingUploads = await getPendingUploads();
    setStatus(prev => ({
      ...prev,
      offlineDocumentCount: stats.documentCount,
      totalOfflineSize: stats.totalSize,
      pendingSyncCount: stats.pendingSyncs,
      pendingUploadCount: pendingUploads.length,
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

  // Queue file for offline upload
  const queueOfflineUpload = useCallback(async (file: File, metadata: any = {}) => {
    try {
      const id = await queueFileUpload(file, metadata);
      await refreshStats();
      
      toast({
        title: "Upload queued",
        description: `${file.name} will be uploaded when you're online`,
      });
      
      return id;
    } catch (error) {
      console.error('Failed to queue upload:', error);
      toast({
        title: "Failed to queue upload",
        description: "Could not save file for later upload",
        variant: "destructive",
      });
      return null;
    }
  }, [toast, refreshStats]);

  // Get pending uploads
  const getPendingUploadsData = useCallback(async () => {
    return await getPendingUploads();
  }, []);

  // Sync selected uploads
  const syncSelectedUploads = useCallback(async (selectedIds: string[]) => {
    if (!status.isOnline || status.isSyncing) return;

    setStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      // Get uploads from both sync_queue and documents store
      const uploadsFromQueue = await getPendingUploads();
      const allDocs = await getAllOfflineDocuments();
      const pendingDocs = allDocs.filter(doc => doc.metadata?.is_pending_upload === true);
      
      // Build combined upload list
      const uploadMap = new Map<string, any>();
      
      // Add from sync queue
      uploadsFromQueue.forEach(upload => {
        uploadMap.set(upload.id, {
          id: upload.id,
          file_name: upload.data?.file_name || 'Unknown',
          file_type: upload.data?.file_type || 'application/octet-stream',
          file_size: upload.data?.file_size || 0,
          file_blob: upload.file_blob,
          metadata: upload.data?.metadata || {},
        });
      });
      
      // Add from documents (these have blob_data instead of file_blob)
      pendingDocs.forEach(doc => {
        if (!uploadMap.has(doc.id)) {
          uploadMap.set(doc.id, {
            id: doc.id,
            file_name: doc.file_name,
            file_type: doc.file_type,
            file_size: doc.file_size,
            file_blob: doc.blob_data,
            metadata: doc.metadata || {},
          });
        }
      });
      
      const selectedUploads = selectedIds
        .map(id => uploadMap.get(id))
        .filter(Boolean);
      
      console.log('📤 Starting sync for', selectedUploads.length, 'uploads');
      
      let successCount = 0;
      let failCount = 0;

      for (const upload of selectedUploads) {
        try {
          // Update status if in sync queue
          try {
            await updateSyncItemStatus(upload.id, 'syncing');
          } catch (e) {
            // Item might only be in documents store
          }

          if (!upload.file_blob) {
            throw new Error('File blob not found');
          }

          // Get user for authentication
          const { data: userData, error: authError } = await supabase.auth.getUser();
          if (authError || !userData.user) {
            throw new Error('User not authenticated');
          }

          const user = userData.user;
          const file = upload.file_blob;
          const metadata = upload.metadata || {};
          const enableRAG = metadata.enableRAG || false;
          const enableClassification = metadata.enableClassification || false;

          // Get file type from blob or upload data
          const fileType = file.type || upload.file_type || 'application/octet-stream';
          const fileName = upload.file_name || file.name || 'unknown';
          const fileSize = upload.file_size || file.size || 0;

          console.log('📤 Uploading:', fileName, 'type:', fileType, 'size:', fileSize);

          // Upload file to Supabase Storage
          const fileExt = fileName.split('.').pop() || 'unknown';
          const storagePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, file);

          if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          console.log('📤 Storage upload successful:', uploadData.path);

          // Determine if we need backend processing
          const needsBackendProcessing = enableRAG || enableClassification;
          let documentData: any = null;

          if (needsBackendProcessing) {
            // Backend processing with RAG/Classification
            const reader = new FileReader();
            const fileBase64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });

            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const analysisResponse = await fetch(`${API_BASE_URL}/api/v1/analyze-document`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                documentData: fileBase64,
                documentName: fileName,
                task: 'without_template_extraction',
                userId: user.id,
                saveToDatabase: true,
                yoloSignatureEnabled: false,
                yoloFaceEnabled: false
              }),
            });

            if (!analysisResponse.ok) {
              throw new Error('Backend analysis failed');
            }

            const analysisData = await analysisResponse.json();
            documentData = analysisData.document;
          } else {
            // Simple upload without backend processing
            const { data, error } = await supabase
              .from('documents')
              .insert({
                file_name: fileName,
                file_type: fileType,
                file_size: fileSize,
                storage_path: uploadData.path,
                user_id: user.id,
                uploaded_by: user.id,
                processing_status: 'pending',
                is_deleted: false,
              })
              .select()
              .single();

            if (error) {
              throw new Error(`Database insert failed: ${error.message}`);
            }

            documentData = data;
          }

          console.log('📤 Document saved to database:', documentData?.id);

          // Remove from sync queue and IndexedDB documents store
          try {
            await removeSyncItem(upload.id);
          } catch (e) {
            // Might not exist in sync queue
          }
          await deleteOfflineDocument(upload.id);
          
          successCount++;
        } catch (error) {
          console.error('Failed to upload:', upload.file_name, error);
          try {
            await updateSyncItemStatus(upload.id, 'failed', true);
          } catch (e) {
            // Might not exist in sync queue
          }
          failCount++;
        }
      }

      await refreshStats();
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        showSyncDialog: false,
        lastSyncAt: new Date().toISOString(),
      }));

      if (successCount > 0) {
        toast({
          title: "Sync complete",
          description: `${successCount} document(s) uploaded successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        });
      } else {
        toast({
          title: "Sync failed",
          description: "All uploads failed. Please try again.",
          variant: "destructive",
        });
      }

      // Trigger document list refresh
      window.dispatchEvent(new CustomEvent('documents-changed'));
      
    } catch (error) {
      console.error('Sync failed:', error);
      setStatus(prev => ({ ...prev, isSyncing: false }));
      toast({
        title: "Sync error",
        description: "Failed to sync documents",
        variant: "destructive",
      });
    }
  }, [status.isOnline, status.isSyncing, toast, refreshStats]);

  // Close sync dialog
  const closeSyncDialog = useCallback(() => {
    setStatus(prev => ({ ...prev, showSyncDialog: false }));
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
    queueOfflineUpload,
    getPendingUploadsData,
    syncSelectedUploads,
    closeSyncDialog,
  };
};
