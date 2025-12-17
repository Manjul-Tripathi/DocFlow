/**
 * Offline Sync API Service
 * Handles communication with backend for offline operations.
 */

import { API_BASE_URL } from '@/config/api';

// Types
export interface OfflineDocumentData {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  download_url?: string;
  metadata: Record<string, unknown>;
  extracted_text?: string;
  document_type?: string;
  processing_status: string;
  version: number;
  last_modified: string;
  created_at: string;
}

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: Record<string, unknown>;
  local_version?: number;
  timestamp: string;
}

export interface SyncConflict {
  operation_id: string;
  document_id: string;
  conflict_type: 'version_mismatch' | 'deleted_on_server' | 'modified_both';
  local_version?: number;
  server_version: number;
  local_data: Record<string, unknown>;
  server_data: Record<string, unknown>;
  server_modified_at: string;
}

export interface SyncBatchResponse {
  success: boolean;
  synced: string[];
  conflicts: SyncConflict[];
  failed: Array<{ operation_id: string; error: string }>;
  server_timestamp: string;
  message?: string;
}

export interface SyncStatus {
  last_sync: string | null;
  pending_changes: number;
  conflicts: number;
  offline_documents: number;
  storage_used: number;
  is_syncing: boolean;
}

export type ConflictResolutionStrategy = 'keep_local' | 'keep_server' | 'merge';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }
      
      // Retry server errors (5xx)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on last attempt
      if (attempt < retries - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Retry ${attempt + 1}/${retries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('Request failed');
}

/**
 * Prepare documents for offline download
 */
export async function prepareDocumentsForDownload(
  userId: string,
  documentIds: string[]
): Promise<{ documents: OfflineDocumentData[]; total_size: number }> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/v1/offline/prepare-download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        document_ids: documentIds,
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to prepare documents for download');
  }
  
  const data = await response.json();
  return {
    documents: data.documents,
    total_size: data.total_size,
  };
}

/**
 * Sync batch of operations to server
 */
export async function syncBatchOperations(
  userId: string,
  operations: SyncOperation[]
): Promise<SyncBatchResponse> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/v1/offline/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        operations,
        client_timestamp: new Date().toISOString(),
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error('Sync failed');
  }
  
  return response.json();
}

/**
 * Get user's sync status
 */
export async function getSyncStatus(userId: string): Promise<SyncStatus> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/v1/offline/status?user_id=${encodeURIComponent(userId)}`,
    { method: 'GET' }
  );
  
  if (!response.ok) {
    throw new Error('Failed to get sync status');
  }
  
  return response.json();
}

/**
 * Resolve a sync conflict
 */
export async function resolveConflict(
  userId: string,
  documentId: string,
  resolution: ConflictResolutionStrategy,
  mergedData?: Record<string, unknown>
): Promise<{
  success: boolean;
  document_id: string;
  new_version: number;
  resolved_data: Record<string, unknown>;
}> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/v1/offline/resolve-conflict`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        document_id: documentId,
        resolution,
        merged_data: mergedData,
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to resolve conflict');
  }
  
  return response.json();
}

/**
 * Mark document for offline access on server
 */
export async function markDocumentOffline(
  userId: string,
  documentId: string,
  offline: boolean
): Promise<boolean> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/v1/offline/mark-offline`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        document_id: documentId,
        offline,
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to mark document offline');
  }
  
  const data = await response.json();
  return data.success;
}

/**
 * Get list of documents marked for offline
 */
export async function getOfflineDocumentsList(
  userId: string
): Promise<Array<{
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  document_type?: string;
  downloaded_at: string;
  version_downloaded: number;
  updated_at: string;
  needs_update: boolean;
}>> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/v1/offline/documents/${encodeURIComponent(userId)}`,
    { method: 'GET' }
  );
  
  if (!response.ok) {
    throw new Error('Failed to get offline documents');
  }
  
  const data = await response.json();
  return data.documents;
}

/**
 * Download file blob from URL
 */
export async function downloadFileBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('Failed to download file');
  }
  
  return response.blob();
}

/**
 * Batch download multiple documents for offline
 */
export async function batchDownloadDocuments(
  userId: string,
  documentIds: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<Array<{ id: string; blob?: Blob; error?: string }>> {
  // Prepare download info
  const { documents } = await prepareDocumentsForDownload(userId, documentIds);
  
  const results: Array<{ id: string; blob?: Blob; error?: string }> = [];
  let completed = 0;
  
  for (const doc of documents) {
    try {
      let blob: Blob | undefined;
      
      if (doc.download_url) {
        blob = await downloadFileBlob(doc.download_url);
      }
      
      results.push({ id: doc.id, blob });
      
      // Mark as offline on server
      await markDocumentOffline(userId, doc.id, true);
      
    } catch (error) {
      results.push({ 
        id: doc.id, 
        error: error instanceof Error ? error.message : 'Download failed' 
      });
    }
    
    completed++;
    onProgress?.(completed, documents.length);
  }
  
  return results;
}
