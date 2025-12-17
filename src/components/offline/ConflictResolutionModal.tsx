/**
 * Conflict Resolution Modal
 * Side-by-side comparison UI for resolving sync conflicts.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Monitor,
  Cloud,
  GitMerge,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import type { SyncConflict, ConflictResolutionStrategy } from '@/services/offlineSyncApi';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: SyncConflict | null;
  onResolve: (strategy: ConflictResolutionStrategy) => Promise<void>;
  totalConflicts?: number;
  currentIndex?: number;
  onNavigate?: (direction: 'prev' | 'next') => void;
}

export function ConflictResolutionModal({
  isOpen,
  onClose,
  conflict,
  onResolve,
  totalConflicts = 1,
  currentIndex = 0,
  onNavigate,
}: ConflictResolutionModalProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<ConflictResolutionStrategy | null>(null);

  if (!conflict) return null;

  const localData = conflict.local_data as Record<string, unknown>;
  const serverData = conflict.server_data as Record<string, unknown>;

  // Handle resolve
  const handleResolve = async (strategy: ConflictResolutionStrategy) => {
    setIsResolving(true);
    setSelectedStrategy(strategy);
    
    try {
      await onResolve(strategy);
      setSelectedStrategy(null);
    } finally {
      setIsResolving(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleString();
  };

  // Get conflict type description
  const getConflictDescription = () => {
    switch (conflict.conflict_type) {
      case 'version_mismatch':
        return 'This document was modified both locally and on the server.';
      case 'deleted_on_server':
        return 'This document was deleted on the server but modified locally.';
      case 'deleted_locally':
        return 'This document was deleted locally but modified on the server.';
      default:
        return 'A conflict occurred with this document.';
    }
  };

  // Render data comparison
  const renderDataComparison = () => {
    const allKeys = new Set([
      ...Object.keys(localData || {}),
      ...Object.keys(serverData || {}),
    ]);

    // Filter out internal fields
    const displayKeys = Array.from(allKeys).filter(
      (key) => !['id', 'user_id', 'version', 'created_at', 'drive_folder_id'].includes(key)
    );

    return displayKeys.map((key) => {
      const localValue = localData?.[key];
      const serverValue = serverData?.[key];
      const isDifferent = JSON.stringify(localValue) !== JSON.stringify(serverValue);

      return (
        <div key={key} className="grid grid-cols-3 gap-4 py-2 border-b border-border last:border-b-0">
          <div className="font-medium text-sm capitalize">
            {key.replace(/_/g, ' ')}
          </div>
          <div className={`text-sm ${isDifferent ? 'bg-blue-500/10 p-2 rounded' : ''}`}>
            {formatValue(localValue)}
          </div>
          <div className={`text-sm ${isDifferent ? 'bg-purple-500/10 p-2 rounded' : ''}`}>
            {formatValue(serverValue)}
          </div>
        </div>
      );
    });
  };

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Resolve Conflict
            </DialogTitle>
            {totalConflicts > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onNavigate?.('prev')}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentIndex + 1} of {totalConflicts}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onNavigate?.('next')}
                  disabled={currentIndex === totalConflicts - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <DialogDescription>{getConflictDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="flex-1">
              <p className="font-medium">
                {(localData?.file_name as string) || (serverData?.file_name as string) || 'Document'}
              </p>
              <p className="text-xs text-muted-foreground">
                Conflict Type: {conflict.conflict_type.replace(/_/g, ' ')}
              </p>
            </div>
            <Badge variant="outline">{conflict.operation_type}</Badge>
          </div>

          {/* Comparison Headers */}
          <div className="grid grid-cols-3 gap-4">
            <div className="font-medium text-muted-foreground">Field</div>
            <div className="flex items-center gap-2 font-medium text-blue-500">
              <Monitor className="h-4 w-4" />
              Local Version
            </div>
            <div className="flex items-center gap-2 font-medium text-purple-500">
              <Cloud className="h-4 w-4" />
              Server Version
            </div>
          </div>

          <Separator />

          {/* Data Comparison */}
          <ScrollArea className="h-60">
            <div className="pr-4">{renderDataComparison()}</div>
          </ScrollArea>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg text-sm">
            <div>
              <span className="text-muted-foreground">Local Modified: </span>
              <span>{formatDate(localData?.updated_at as string)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Server Modified: </span>
              <span>{formatDate(serverData?.updated_at as string)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={isResolving}>
            Cancel
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
              onClick={() => handleResolve('keep_local')}
              disabled={isResolving}
            >
              {isResolving && selectedStrategy === 'keep_local' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Monitor className="h-4 w-4 mr-2" />
              )}
              Keep Local
            </Button>
            
            <Button
              variant="outline"
              className="border-purple-500 text-purple-500 hover:bg-purple-500/10"
              onClick={() => handleResolve('keep_server')}
              disabled={isResolving}
            >
              {isResolving && selectedStrategy === 'keep_server' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4 mr-2" />
              )}
              Keep Server
            </Button>
            
            <Button
              onClick={() => handleResolve('merge')}
              disabled={isResolving || conflict.conflict_type === 'deleted_on_server'}
            >
              {isResolving && selectedStrategy === 'merge' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4 mr-2" />
              )}
              Smart Merge
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
