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
} from 'lucide-react';
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
    syncPendingChanges,
    clearOfflineData,
    refreshStats,
  } = useOfflineMode();

  const [documents, setDocuments] = useState<OfflineDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Load offline documents
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await getOfflineDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load offline documents:', error);
    } finally {
      setLoading(false);
    }
  }, [getOfflineDocuments]);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen, loadDocuments]);

  // Handle sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncPendingChanges();
      await refreshStats();
      await loadDocuments();
    } finally {
      setSyncing(false);
    }
  };

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
            {status.isOnline ? (
              <Cloud className="h-5 w-5 text-green-500" />
            ) : (
              <CloudOff className="h-5 w-5 text-red-500" />
            )}
          </div>
          <SheetDescription>
            Manage documents available offline
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
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

        {/* Sync Status */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="space-y-1">
            {status.pendingSyncCount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span>{status.pendingSyncCount} pending changes</span>
              </div>
            )}
            {status.lastSyncAt && (
              <div className="text-xs text-muted-foreground">
                Last sync: {new Date(status.lastSyncAt).toLocaleString()}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing || !status.isOnline}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

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
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted group"
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
                    <div className="flex items-center gap-1">
                      {getStatusIcon(doc.sync_status)}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
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
