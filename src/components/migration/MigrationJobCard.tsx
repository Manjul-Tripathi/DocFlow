import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Cloud,
  HardDrive,
  Database,
  Play,
  Pause,
  Square,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MigrationJob, SourceSystem } from '@/types/migration';

interface MigrationJobCardProps {
  job: MigrationJob;
  isSelected: boolean;
  onClick: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  stats: {
    progress: number;
    bytesProgress: number;
    eta: string | null;
    filesPerMinute: number;
    bytesPerSecond: number;
    throttleCount: number;
  };
}

export function MigrationJobCard({
  job,
  isSelected,
  onClick,
  onStart,
  onPause,
  onResume,
  onCancel,
  stats
}: MigrationJobCardProps) {
  const getSourceIcon = (source: SourceSystem) => {
    switch (source) {
      case 'google_drive': return <Cloud className="h-4 w-4 text-blue-500" />;
      case 'onedrive': return <HardDrive className="h-4 w-4 text-sky-500" />;
      case 'filenet': return <Database className="h-4 w-4 text-purple-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (job.status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'discovering':
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Discovering</Badge>;
      case 'running':
        return <Badge variant="default" className="bg-green-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      case 'paused':
        return <Badge variant="outline"><Pause className="h-3 w-3 mr-1" />Paused</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><Square className="h-3 w-3 mr-1" />Cancelled</Badge>;
    }
  };

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getSourceIcon(job.source_system)}
            <div>
              <p className="font-medium text-sm truncate max-w-[150px]">{job.name}</p>
              <p className="text-xs text-muted-foreground">
                {job.source_system?.replace('_', ' ') || 'Unknown'}
              </p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Progress */}
        {job.total_items > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{job.processed_items.toLocaleString()} / {job.total_items.toLocaleString()}</span>
              <span>{stats.progress}%</span>
            </div>
            <Progress value={stats.progress} className="h-1.5" />
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          {job.failed_items > 0 && (
            <span className="text-red-500">{job.failed_items} failed</span>
          )}
          {job.skipped_items > 0 && (
            <span>{job.skipped_items} skipped</span>
          )}
          {stats.eta && job.status === 'running' && (
            <span>ETA: {stats.eta}</span>
          )}
        </div>

        {/* Transfer Time for Completed Jobs */}
        {job.status === 'completed' && job.config && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className="font-medium">
                {job.config.total_time_seconds
                  ? `${job.config.total_time_seconds}s`
                  : job.config.transfer_time_seconds
                    ? `${job.config.transfer_time_seconds}s`
                    : '—'
                }
              </span>
            </div>
            {job.transferred_bytes > 0 && (
              <span>
                {(job.transferred_bytes / 1024).toFixed(1)} KB
              </span>
            )}
            {job.config.speed_mbps > 0 && (
              <span>
                {(job.config.speed_mbps * 1024).toFixed(0)} KB/s
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {job.status === 'pending' && (
            <Button
              size="sm"
              variant="default"
              className="w-full"
              onClick={(e) => handleAction(e, onStart)}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          {['running', 'discovering'].includes(job.status) && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={(e) => handleAction(e, onPause)}
              >
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => handleAction(e, onCancel)}
              >
                <Square className="h-3 w-3" />
              </Button>
            </>
          )}
          {job.status === 'paused' && (
            <>
              <Button
                size="sm"
                variant="default"
                className="flex-1"
                onClick={(e) => handleAction(e, onResume)}
              >
                <Play className="h-3 w-3 mr-1" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => handleAction(e, onCancel)}
              >
                <Square className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
