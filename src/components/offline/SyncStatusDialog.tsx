/**
 * Sync Status Dialog
 * Shows sync progress, pending changes, and conflicts.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Cloud,
  CloudOff,
  Loader2,
  FileText,
  Clock,
} from 'lucide-react';
import { useOfflineMode } from '@/hooks/useOfflineMode';
import type { SyncConflict } from '@/services/offlineSyncApi';

interface SyncStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts?: SyncConflict[];
  onResolveConflict?: (conflict: SyncConflict) => void;
}

interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  status: 'idle' | 'syncing' | 'completed' | 'error';
}

export function SyncStatusDialog({
  isOpen,
  onClose,
  conflicts = [],
  onResolveConflict,
}: SyncStatusDialogProps) {
  const { status, syncPendingChanges, refreshStats } = useOfflineMode();
  
  const [progress, setProgress] = useState<SyncProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    status: 'idle',
  });

  // Reset progress when dialog opens
  useEffect(() => {
    if (isOpen) {
      setProgress({
        total: status.pendingSyncCount,
        completed: 0,
        failed: 0,
        status: 'idle',
      });
    }
  }, [isOpen, status.pendingSyncCount]);

  // Handle sync
  const handleSync = async () => {
    setProgress((prev) => ({ ...prev, status: 'syncing' }));
    
    try {
      await syncPendingChanges();
      await refreshStats();
      
      setProgress((prev) => ({
        ...prev,
        completed: prev.total,
        status: 'completed',
      }));
    } catch (error) {
      setProgress((prev) => ({
        ...prev,
        status: 'error',
        failed: prev.total - prev.completed,
      }));
    }
  };

  // Calculate progress percentage
  const progressPercent = progress.total > 0
    ? (progress.completed / progress.total) * 100
    : 0;

  // Get status icon
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'syncing':
        return <Loader2 className="h-6 w-6 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'error':
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return status.isOnline 
          ? <Cloud className="h-6 w-6 text-green-500" />
          : <CloudOff className="h-6 w-6 text-red-500" />;
    }
  };

  // Get status message
  const getStatusMessage = () => {
    switch (progress.status) {
      case 'syncing':
        return `Syncing ${progress.completed}/${progress.total} changes...`;
      case 'completed':
        return progress.failed > 0
          ? `Sync completed with ${progress.failed} errors`
          : 'All changes synced successfully!';
      case 'error':
        return 'Sync failed. Please try again.';
      default:
        return status.isOnline
          ? `${status.pendingSyncCount} changes pending`
          : 'Offline - changes will sync when online';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sync Status
          </DialogTitle>
          <DialogDescription>
            View sync progress and resolve conflicts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status Section */}
          <div className="flex items-center gap-4">
            {getStatusIcon()}
            <div className="flex-1">
              <p className="font-medium">{getStatusMessage()}</p>
              {status.lastSyncAt && progress.status !== 'syncing' && (
                <p className="text-sm text-muted-foreground">
                  Last sync: {new Date(status.lastSyncAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {progress.status === 'syncing' && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {progress.completed} of {progress.total} changes synced
              </p>
            </div>
          )}

          {/* Conflicts Section */}
          {conflicts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">
                  {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''} Found
                </span>
              </div>
              
              <ScrollArea className="h-40">
                <div className="space-y-2">
                  {conflicts.map((conflict) => (
                    <div
                      key={conflict.operation_id}
                      className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg"
                    >
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {(conflict.local_data as any)?.file_name || 'Document'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conflict.conflict_type === 'version_mismatch'
                            ? 'Modified on both local and server'
                            : 'Document deleted on server'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onResolveConflict?.(conflict)}
                      >
                        Resolve
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Pending Changes */}
          {status.pendingSyncCount > 0 && progress.status === 'idle' && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">
                {status.pendingSyncCount} change{status.pendingSyncCount > 1 ? 's' : ''} waiting to sync
              </span>
            </div>
          )}

          {/* No Changes */}
          {status.pendingSyncCount === 0 && conflicts.length === 0 && progress.status === 'idle' && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600">
                Everything is up to date
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {status.pendingSyncCount > 0 && status.isOnline && (
            <Button
              onClick={handleSync}
              disabled={progress.status === 'syncing'}
            >
              {progress.status === 'syncing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
