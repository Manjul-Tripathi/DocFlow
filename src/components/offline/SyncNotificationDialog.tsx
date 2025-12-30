import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { SyncQueueItem } from '@/services/offlineStorage';

interface SyncNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingUploads: SyncQueueItem[];
  onSync: (selectedIds: string[]) => Promise<void>;
  onDismiss: () => void;
}

export const SyncNotificationDialog: React.FC<SyncNotificationDialogProps> = ({
  open,
  onOpenChange,
  pendingUploads,
  onSync,
  onDismiss,
}) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    new Set(pendingUploads.map(item => item.id))
  );
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<Map<string, 'success' | 'error'>>(new Map());

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (selectedItems.size === pendingUploads.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pendingUploads.map(item => item.id)));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync(Array.from(selectedItems));
      // Mark all as success
      const results = new Map();
      selectedItems.forEach(id => results.set(id, 'success' as const));
      setSyncResults(results);
      
      // Auto close after 2 seconds
      setTimeout(() => {
        onOpenChange(false);
        setSyncResults(new Map());
      }, 2000);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Sync Offline Changes
          </AlertDialogTitle>
          <AlertDialogDescription>
            You have {pendingUploads.length} document{pendingUploads.length !== 1 ? 's' : ''} waiting to be uploaded.
            Select which documents you want to sync now.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Select All */}
          <div className="flex items-center gap-2 p-2 border-b">
            <Checkbox
              checked={selectedItems.size === pendingUploads.length}
              onCheckedChange={toggleAll}
              disabled={syncing}
            />
            <span className="text-sm font-medium">
              Select All ({selectedItems.size}/{pendingUploads.length})
            </span>
          </div>

          {/* Documents List */}
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {pendingUploads.map(item => {
                const syncResult = syncResults.get(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      selectedItems.has(item.id) ? 'bg-primary/5 border-primary' : 'bg-white'
                    }`}
                  >
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItem(item.id)}
                      disabled={syncing}
                      className="mt-1"
                    />
                    
                    <FileText className="w-5 h-5 text-blue-500 mt-1 flex-shrink-0" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{item.data.file_name}</p>
                        {syncResult === 'success' && (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                        {syncResult === 'error' && (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {formatFileSize(item.data.file_size)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Queued {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDismiss} disabled={syncing}>
            Later
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSync}
            disabled={selectedItems.size === 0 || syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Sync {selectedItems.size} Document{selectedItems.size !== 1 ? 's' : ''}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
