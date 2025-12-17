import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Sync status types
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'failed';

export interface OfflineDocument {
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
  blob_data?: Blob;
  cached_at: string;
  is_favorite: boolean;
  // Version tracking for sync
  version: number;
  local_version: number;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  local_changes?: ChangeLog[];
}

interface ChangeLog {
  field: string;
  old_value: any;
  new_value: any;
  changed_at: string;
}

interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  created_at: string;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
  local_version?: number;
}

interface SimplifyDriveDB extends DBSchema {
  documents: {
    key: string;
    value: OfflineDocument;
    indexes: {
      'by-updated': string;
      'by-name': string;
      'by-favorite': number;
      'by-sync-status': string;
    };
  };
  sync_queue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      'by-status': string;
      'by-created': string;
    };
  };
  app_cache: {
    key: string;
    value: {
      key: string;
      data: any;
      cached_at: string;
      expires_at?: string;
    };
  };
}

let db: IDBPDatabase<SimplifyDriveDB> | null = null;

export const initOfflineDB = async (): Promise<IDBPDatabase<SimplifyDriveDB>> => {
  if (db) return db;

  db = await openDB<SimplifyDriveDB>('simplify-drive-offline', 3, {
    upgrade(database, oldVersion, newVersion, transaction) {
      // Documents store
      if (!database.objectStoreNames.contains('documents')) {
        const docStore = database.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('by-updated', 'updated_at');
        docStore.createIndex('by-name', 'file_name');
        docStore.createIndex('by-favorite', 'is_favorite');
        docStore.createIndex('by-sync-status', 'sync_status');
      } else if (oldVersion < 3) {
        // Add new index for existing store
        const docStore = transaction.objectStore('documents');
        if (!docStore.indexNames.contains('by-sync-status')) {
          docStore.createIndex('by-sync-status', 'sync_status');
        }
      }

      // Sync queue store
      if (!database.objectStoreNames.contains('sync_queue')) {
        const syncStore = database.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('by-status', 'status');
        syncStore.createIndex('by-created', 'created_at');
      }

      // App cache store
      if (!database.objectStoreNames.contains('app_cache')) {
        database.createObjectStore('app_cache', { keyPath: 'key' });
      }
    },
  });

  return db;
};

// Export OfflineDocument type
export type { OfflineDocument, SyncQueueItem, ChangeLog };

// Document operations
export const saveDocumentOffline = async (
  document: Omit<OfflineDocument, 'cached_at' | 'is_favorite' | 'version' | 'local_version' | 'sync_status' | 'last_synced_at'> & { version?: number },
  blob?: Blob
): Promise<void> => {
  const database = await initOfflineDB();
  
  console.log('💾 Saving document offline:', {
    id: document.id,
    file_name: document.file_name,
    storage_url: document.storage_url,
    has_blob: !!blob,
    blob_size: blob?.size || 0,
    blob_type: blob?.type || 'none'
  });
  
  const offlineDoc: OfflineDocument = {
    ...document,
    blob_data: blob,
    cached_at: new Date().toISOString(),
    version: document.version || 1,
    local_version: document.version || 1,
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
    is_favorite: false,
  };

  await database.put('documents', offlineDoc);
  console.log('✅ Document saved to IndexedDB with blob_data:', !!offlineDoc.blob_data);
};

export const getOfflineDocument = async (id: string): Promise<OfflineDocument | undefined> => {
  const database = await initOfflineDB();
  return database.get('documents', id);
};

export const getAllOfflineDocuments = async (): Promise<OfflineDocument[]> => {
  const database = await initOfflineDB();
  const docs = await database.getAll('documents');
  console.log('📦 getAllOfflineDocuments called, found:', docs.length, 'documents');
  return docs;
};

export const deleteOfflineDocument = async (id: string): Promise<void> => {
  const database = await initOfflineDB();
  await database.delete('documents', id);
};

export const toggleDocumentFavorite = async (id: string): Promise<void> => {
  const database = await initOfflineDB();
  const doc = await database.get('documents', id);
  if (doc) {
    doc.is_favorite = !doc.is_favorite;
    await database.put('documents', doc);
  }
};

export const getOfflineDocumentBlob = async (id: string): Promise<Blob | undefined> => {
  const document = await getOfflineDocument(id);
  return document?.blob_data;
};

// Sync queue operations
export const addToSyncQueue = async (
  operation: SyncQueueItem['operation'],
  table: string,
  data: any
): Promise<void> => {
  const database = await initOfflineDB();
  
  const item: SyncQueueItem = {
    id: crypto.randomUUID(),
    operation,
    table,
    data,
    created_at: new Date().toISOString(),
    retries: 0,
    status: 'pending',
  };

  await database.put('sync_queue', item);
};

export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const database = await initOfflineDB();
  return database.getAllFromIndex('sync_queue', 'by-status', 'pending');
};

export const updateSyncItemStatus = async (
  id: string,
  status: SyncQueueItem['status'],
  incrementRetry = false
): Promise<void> => {
  const database = await initOfflineDB();
  const item = await database.get('sync_queue', id);
  if (item) {
    item.status = status;
    if (incrementRetry) {
      item.retries += 1;
    }
    await database.put('sync_queue', item);
  }
};

export const removeSyncItem = async (id: string): Promise<void> => {
  const database = await initOfflineDB();
  await database.delete('sync_queue', id);
};

export const getSyncQueueCount = async (): Promise<number> => {
  const database = await initOfflineDB();
  const items = await database.getAllFromIndex('sync_queue', 'by-status', 'pending');
  return items.length;
};

// Cache operations
export const cacheData = async (
  key: string,
  data: any,
  expiresInMinutes?: number
): Promise<void> => {
  const database = await initOfflineDB();
  
  const cacheItem = {
    key,
    data,
    cached_at: new Date().toISOString(),
    expires_at: expiresInMinutes
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : undefined,
  };

  await database.put('app_cache', cacheItem);
};

export const getCachedData = async <T>(key: string): Promise<T | null> => {
  const database = await initOfflineDB();
  const item = await database.get('app_cache', key);
  
  if (!item) return null;
  
  if (item.expires_at && new Date(item.expires_at) < new Date()) {
    await database.delete('app_cache', key);
    return null;
  }
  
  return item.data as T;
};

export const clearCache = async (): Promise<void> => {
  const database = await initOfflineDB();
  await database.clear('app_cache');
};

// Storage stats
export const getOfflineStorageStats = async (): Promise<{
  documentCount: number;
  totalSize: number;
  pendingSyncs: number;
  conflictCount: number;
}> => {
  const database = await initOfflineDB();
  const documents = await database.getAll('documents');
  const pendingSyncs = await getSyncQueueCount();
  
  const totalSize = documents.reduce((sum, doc) => {
    const blobSize = doc.blob_data?.size || 0;
    return sum + doc.file_size + blobSize;
  }, 0);

  const conflictCount = documents.filter(doc => doc.sync_status === 'conflict').length;

  return {
    documentCount: documents.length,
    totalSize,
    pendingSyncs,
    conflictCount,
  };
};

// Clear all offline data
export const clearAllOfflineData = async (): Promise<void> => {
  const database = await initOfflineDB();
  await database.clear('documents');
  await database.clear('sync_queue');
  await database.clear('app_cache');
};

// ============== New Functions for Enhanced Offline Support ==============

// Update document sync status
export const updateDocumentSyncStatus = async (
  id: string,
  status: SyncStatus,
  newVersion?: number
): Promise<void> => {
  const database = await initOfflineDB();
  const doc = await database.get('documents', id);
  if (doc) {
    doc.sync_status = status;
    if (newVersion !== undefined) {
      doc.version = newVersion;
      doc.local_version = newVersion;
    }
    if (status === 'synced') {
      doc.last_synced_at = new Date().toISOString();
      doc.local_changes = [];
    }
    await database.put('documents', doc);
  }
};

// Record a local change to a document
export const recordLocalChange = async (
  id: string,
  field: string,
  oldValue: any,
  newValue: any
): Promise<void> => {
  const database = await initOfflineDB();
  const doc = await database.get('documents', id);
  if (doc) {
    const change: ChangeLog = {
      field,
      old_value: oldValue,
      new_value: newValue,
      changed_at: new Date().toISOString(),
    };
    doc.local_changes = [...(doc.local_changes || []), change];
    doc.local_version = (doc.local_version || doc.version || 1) + 1;
    doc.sync_status = 'pending';
    await database.put('documents', doc);
  }
};

// Get documents by sync status
export const getDocumentsBySyncStatus = async (
  status: SyncStatus
): Promise<OfflineDocument[]> => {
  const database = await initOfflineDB();
  return database.getAllFromIndex('documents', 'by-sync-status', status);
};

// Get documents with pending changes
export const getDocumentsWithPendingChanges = async (): Promise<OfflineDocument[]> => {
  return getDocumentsBySyncStatus('pending');
};

// Get documents with conflicts
export const getDocumentsWithConflicts = async (): Promise<OfflineDocument[]> => {
  return getDocumentsBySyncStatus('conflict');
};

// Mark document as having a conflict
export const markDocumentConflict = async (
  id: string,
  serverVersion: number
): Promise<void> => {
  const database = await initOfflineDB();
  const doc = await database.get('documents', id);
  if (doc) {
    doc.sync_status = 'conflict';
    // Store server version for comparison
    await database.put('documents', doc);
  }
};

// Resolve conflict by keeping local changes
export const resolveConflictKeepLocal = async (id: string): Promise<void> => {
  await updateDocumentSyncStatus(id, 'pending');
};

// Resolve conflict by discarding local changes
export const resolveConflictKeepServer = async (
  id: string,
  serverData: Partial<OfflineDocument>,
  serverVersion: number
): Promise<void> => {
  const database = await initOfflineDB();
  const doc = await database.get('documents', id);
  if (doc) {
    // Update with server data
    Object.assign(doc, serverData, {
      version: serverVersion,
      local_version: serverVersion,
      sync_status: 'synced' as SyncStatus,
      last_synced_at: new Date().toISOString(),
      local_changes: [],
    });
    await database.put('documents', doc);
  }
};

// Check if a document has unsaved local changes
export const hasLocalChanges = async (id: string): Promise<boolean> => {
  const database = await initOfflineDB();
  const doc = await database.get('documents', id);
  if (!doc) return false;
  return (doc.local_changes?.length || 0) > 0 || doc.local_version !== doc.version;
};

// Get sync queue items for a specific document
export const getSyncQueueItemsForDocument = async (
  documentId: string
): Promise<SyncQueueItem[]> => {
  const database = await initOfflineDB();
  const allItems = await database.getAll('sync_queue');
  return allItems.filter(item => item.data?.id === documentId);
};
