/**
 * Offline Documents Panel
 * UI for managing offline documents, sync status, and storage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  HardDrive,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  X,
  CloudUpload,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useOfflineMode } from '@/hooks/useOfflineMode';
import { formatFileSize } from '@/utils/formatters';
import type { OfflineDocument } from '@/services/offlineStorage';

interface OfflineDocumentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  maxStorageMB?: number;
}

export function OfflineDocumentsPanel({
  isOpen,
  onClose,
  maxStorageMB = 500,
}: OfflineDocumentsPanelProps) {
  const {
    status,
    getOfflineDocuments,
    removeDocumentFromOffline,
    clearOfflineData,
    refreshStats,
    getPendingUploadsData,
    syncSelectedUploads,
  } = useOfflineMode();

  const [documents, setDocuments] = useState<OfflineDocument[]>([]);
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Load offline documents
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await getOfflineDocuments();
      console.log('📦 All offline documents:', docs.length, docs);
      
      // Separate pending uploads from regular offline documents
      const pendingDocs = docs.filter(doc => doc.metadata?.is_pending_upload === true);
      const regularDocs = docs.filter(doc => !doc.metadata?.is_pending_upload);
      
      setDocuments(regularDocs);
      console.log('📦 Regular offline documents:', regularDocs.length);
      
      // Convert pending docs to upload format for consistency
      const uploadsFromDocs = pendingDocs.map(doc => ({
        id: doc.id,
        file_name: doc.file_name,
        file_type: doc.file_type || doc.blob_data?.type || 'application/octet-stream',
        file_size: doc.file_size || doc.blob_data?.size || 0,
        file_blob: doc.blob_data,
        metadata: doc.metadata || {},
        data: {
          id: doc.id,
          file_name: doc.file_name,
          file_type: doc.file_type || doc.blob_data?.type || 'application/octet-stream',
          file_size: doc.file_size || doc.blob_data?.size || 0,
          metadata: doc.metadata,
        },
        status: 'pending',
      }));
      
      // Also try to get from sync queue and normalize format
      const rawUploadsFromQueue = await getPendingUploadsData();
      const uploadsFromQueue = rawUploadsFromQueue.map(upload => ({
        id: upload.id,
        file_name: upload.data?.file_name || upload.file_blob?.name || 'Unknown',
        file_type: upload.data?.file_type || upload.file_blob?.type || 'application/octet-stream',
        file_size: upload.data?.file_size || upload.file_blob?.size || 0,
        file_blob: upload.file_blob,
        metadata: upload.data?.metadata || {},
        data: upload.data,
        status: upload.status || 'pending',
      }));
      
      console.log('📤 Uploads from sync_queue:', uploadsFromQueue.length, uploadsFromQueue);
      console.log('📤 Uploads from documents:', uploadsFromDocs.length, uploadsFromDocs);
      
      // Merge both sources, avoiding duplicates
      const allUploadIds = new Set<string>();
      const allUploads: any[] = [];
      
      [...uploadsFromDocs, ...uploadsFromQueue].forEach(upload => {
        if (!allUploadIds.has(upload.id)) {
          allUploadIds.add(upload.id);
          allUploads.push(upload);
        }
      });
      
      setPendingUploads(allUploads);
      console.log('📤 Total pending uploads:', allUploads.length);
    } catch (error) {
      console.error('Failed to load offline documents:', error);
    } finally {
      setLoading(false);
    }
  }, [getOfflineDocuments, getPendingUploadsData]);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      refreshStats();
    }
  }, [isOpen, loadDocuments, refreshStats]);

  // Handle remove document
  const handleRemoveDocument = async (documentId: string) => {
    await removeDocumentFromOffline(documentId);
    await loadDocuments();
  };

  // Handle clear all
  const handleClearAll = async () => {
    if (confirm('Remove all offline documents? This cannot be undone.')) {
      await clearOfflineData();
      await loadDocuments();
    }
  };

  // Handle sync selected uploads
  const handleSyncSelected = async () => {
    if (selectedUploads.size === 0) return;
    
    setSyncing(true);
    try {
      await syncSelectedUploads(Array.from(selectedUploads));
      setSelectedUploads(new Set());
      await loadDocuments();
      await refreshStats();
    } finally {
      setSyncing(false);
    }
  };

  // Toggle upload selection
  const toggleUploadSelection = (id: string) => {
    setSelectedUploads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select all uploads
  const selectAllUploads = () => {
    if (selectedUploads.size === pendingUploads.length) {
      setSelectedUploads(new Set());
    } else {
      setSelectedUploads(new Set(pendingUploads.map(u => u.id)));
    }
  };

  // Calculate storage percentage
  const maxStorageBytes = maxStorageMB * 1024 * 1024;
  const storagePercent = Math.min(
    (status.totalOfflineSize / maxStorageBytes) * 100,
    100
  );

  // Get status icon
  const getStatusIcon = (syncStatus?: string) => {
    switch (syncStatus) {
      case 'synced':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'conflict':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[450px]">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              <SheetTitle>Offline Storage</SheetTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  loadDocuments();
                  refreshStats();
                }}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              {status.isOnline ? (
                <Cloud className="h-5 w-5 text-green-500" />
              ) : (
                <CloudOff className="h-5 w-5 text-red-500" />
              )}
            </div>
          </div>
          <SheetDescription>
            Manage documents available offline
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
        {/* Pending Uploads Section */}
        {pendingUploads.length > 0 && (
          <div className="space-y-2 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudUpload className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium">
                  Queued for Upload ({pendingUploads.length})
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={selectAllUploads}
              >
                {selectedUploads.size === pendingUploads.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {pendingUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted group border"
                  >
                    <Checkbox
                      checked={selectedUploads.has(upload.id)}
                      onCheckedChange={() => toggleUploadSelection(upload.id)}
                    />
                    <FileText className="h-8 w-8 text-orange-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {upload.data?.file_name || 'Unknown'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(upload.data?.file_size || 0)}</span>
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-400">
                          Pending
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button
              className="w-full"
              onClick={handleSyncSelected}
              disabled={selectedUploads.size === 0 || syncing || !status.isOnline}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4 mr-2" />
                  Sync Selected ({selectedUploads.size})
                </>
              )}
            </Button>
          </div>
        )}

        {/* Storage Usage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Storage Used</span>
            <span className="font-medium">
              {formatFileSize(status.totalOfflineSize)} / {maxStorageMB} MB
            </span>
          </div>
          <Progress value={storagePercent} className="h-2" />
        </div>

        {/* Sync Status - Only show last sync time */}
        {status.lastSyncAt && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-xs text-muted-foreground">
              Last sync: {new Date(status.lastSyncAt).toLocaleString()}
            </div>
          </div>
        )}

        {/* Documents List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Offline Documents ({documents.length})
            </span>
            {documents.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            )}
          </div>

          <ScrollArea className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Download className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No documents saved offline
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click the download icon on any document to save it offline
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted group border"
                  >
                    <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {doc.file_name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(doc.file_size)}</span>
                        {doc.is_favorite && (
                          <Badge variant="secondary" className="text-xs">
                            ★
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {getStatusIcon(doc.sync_status)}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Offline Mode Info */}
        {!status.isOnline && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              <span>You're offline</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Changes will sync when you're back online
            </p>
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
