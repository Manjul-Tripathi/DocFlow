import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  FileText,
  Search,
  Zap,
  AlertTriangle,
  Play,
  FastForward,
} from 'lucide-react';
import { useProcessingPipeline, ProcessingQueueItem } from '@/hooks/useProcessingPipeline';
import { formatDistanceToNow } from 'date-fns';

export function ProcessingQueuePanel() {
  const {
    processingQueue,
    searchQueue: _searchQueue, // Available for future search index features
    loading,
    getQueueStats,
    retryFailed,
    cancelProcessing,
    simulateProcessing,
    simulateFullProcessing,
    refresh,
  } = useProcessingPipeline();

  const stats = getQueueStats();

  const getStageLabel = (stage: ProcessingQueueItem['stage']) => {
    const labels: Record<string, string> = {
      uploaded: 'Queued',
      virus_scan: 'Scanning',
      text_extraction: 'Extracting Text',
      classification: 'Classifying',
      embedding: 'Generating Embeddings',
      indexing: 'Indexing',
      completed: 'Completed',
      failed: 'Failed',
    };
    return labels[stage] || stage;
  };

  const getStageColor = (stage: ProcessingQueueItem['stage']) => {
    switch (stage) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'uploaded':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getStageProgress = (stage: ProcessingQueueItem['stage']): number => {
    const stages = ['uploaded', 'virus_scan', 'text_extraction', 'classification', 'embedding', 'indexing', 'completed'];
    const index = stages.indexOf(stage);
    if (stage === 'failed') return 0;
    return ((index + 1) / stages.length) * 100;
  };

  React.useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Processing Pipeline</h2>
          <p className="text-muted-foreground">Document processing and search indexing status</p>
        </div>
        <Button onClick={refresh} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.processing.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Loader2 className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.processing.inProgress}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.processing.completed}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.processing.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Index Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Index Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {stats.search.pending} pending
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-400">
                <CheckCircle className="h-3 w-3" />
                {stats.search.completed} indexed
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Document Processing Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {processingQueue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No documents in processing queue</p>
              <p className="text-xs mt-2">Upload documents to see them processed here</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {processingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate max-w-[200px]">
                          {item.documents?.name || item.documents?.file_name || 'Unknown Document'}
                        </span>
                        {item.documents?.file_type && (
                          <Badge variant="outline" className="text-xs">
                            {item.documents.file_type.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getStageColor(item.stage)}>
                          {item.stage === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                          {item.stage !== 'completed' && item.stage !== 'failed' && item.started_at && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          {getStageLabel(item.stage)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      {item.stage !== 'completed' && item.stage !== 'failed' && (
                        <Progress value={item.progress_percent || getStageProgress(item.stage)} className="h-1.5 mt-2" />
                      )}
                      
                      {item.last_error && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {item.last_error}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>Attempts: {item.attempts}/{item.max_attempts}</span>
                        <span>•</span>
                        <span>Priority: {item.priority}</span>
                        {item.stage !== 'uploaded' && item.stage !== 'completed' && item.stage !== 'failed' && (
                          <>
                            <span>•</span>
                            <span>Progress: {item.progress_percent || 0}%</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {/* Simulate next stage button */}
                      {item.stage !== 'completed' && item.stage !== 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => simulateProcessing(item.id)}
                          title="Advance to next stage"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Complete all stages button */}
                      {item.stage !== 'completed' && item.stage !== 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => simulateFullProcessing(item.id)}
                          title="Complete all stages"
                          className="text-green-500 hover:text-green-600"
                        >
                          <FastForward className="h-4 w-4" />
                        </Button>
                      )}
                      {item.stage === 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryFailed(item.id)}
                          title="Retry processing"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      {!item.completed_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelProcessing(item.id)}
                          className="text-destructive hover:text-destructive"
                          title="Cancel processing"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
