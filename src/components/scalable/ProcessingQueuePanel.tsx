import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  TrendingUp,
  Timer,
  ChevronDown,
  ChevronUp,
  Info,
  BarChart3,
  Activity,
} from 'lucide-react';
import { useProcessingPipeline, ProcessingQueueItem } from '@/hooks/useProcessingPipeline';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';

export function ProcessingQueuePanel() {
  const {
    processingQueue,
    searchQueue: _searchQueue,
    loading,
    getQueueStats,
    retryFailed,
    cancelProcessing,
    simulateProcessing,
    simulateFullProcessing,
    syncQueueWithDocuments,
    clearCompleted,
    clearAll,
    refresh,
  } = useProcessingPipeline();

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all');

  const stats = getQueueStats();

  // Calculate additional metrics
  const completedItems = processingQueue.filter((q: ProcessingQueueItem) => q.stage === 'completed');
  const avgProcessingTime = completedItems.length > 0
    ? completedItems.reduce((acc: number, item: ProcessingQueueItem) => {
        if (item.started_at && item.completed_at) {
          return acc + differenceInMinutes(new Date(item.completed_at), new Date(item.started_at));
        }
        return acc;
      }, 0) / completedItems.length
    : 0;
  
  const successRate = processingQueue.length > 0
    ? Math.round((stats.processing.completed / (stats.processing.completed + stats.processing.failed || 1)) * 100)
    : 100;

  const getStageLabel = (stage: ProcessingQueueItem['stage']) => {
    const labels: Record<string, string> = {
      uploaded: 'Queued',
      virus_scan: 'Virus Scanning',
      text_extraction: 'Extracting Text',
      classification: 'AI Classification',
      embedding: 'Creating Embeddings',
      indexing: 'Indexing for Search',
      completed: 'Completed',
      failed: 'Failed',
    };
    return labels[stage] || stage;
  };

  const getStageColor = (stage: ProcessingQueueItem['stage']) => {
    switch (stage) {
      case 'completed':
        return 'bg-green-500/20 text-green-500 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-500 border-red-500/30';
      case 'uploaded':
        return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      default:
        return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
    }
  };

  const getStageProgress = (stage: ProcessingQueueItem['stage']): number => {
    const stages = ['uploaded', 'virus_scan', 'text_extraction', 'classification', 'embedding', 'indexing', 'completed'];
    const index = stages.indexOf(stage);
    if (stage === 'failed') return 0;
    return ((index + 1) / stages.length) * 100;
  };

  // Check if document is actually processed based on document data
  const isActuallyProcessed = (item: ProcessingQueueItem): boolean => {
    const doc = item.documents;
    if (!doc) return false;
    const hasExtractedText = doc.extracted_text && doc.extracted_text.length > 0;
    const hasAnalysisResult = doc.analysis_result && Object.keys(doc.analysis_result).length > 0;
    return doc.processing_status === 'completed' || hasExtractedText || hasAnalysisResult;
  };

  // Filter items based on tab
  const getFilteredItems = (): ProcessingQueueItem[] => {
    switch (activeTab) {
      case 'pending':
        return processingQueue.filter((q: ProcessingQueueItem) => q.stage === 'uploaded' || (!q.completed_at && q.stage !== 'failed' && q.stage !== 'completed'));
      case 'processing':
        return processingQueue.filter((q: ProcessingQueueItem) => q.started_at && !q.completed_at && q.stage !== 'failed' && q.stage !== 'uploaded' && q.stage !== 'completed');
      case 'completed':
        return processingQueue.filter((q: ProcessingQueueItem) => q.stage === 'completed');
      case 'failed':
        return processingQueue.filter((q: ProcessingQueueItem) => q.stage === 'failed');
      default:
        return processingQueue;
    }
  };

  // Render visual pipeline stages
  const renderPipelineStages = (currentStage: ProcessingQueueItem['stage'], isOutOfSync = false) => {
    const stages = [
      { key: 'uploaded', label: 'Queued', icon: Clock },
      { key: 'virus_scan', label: 'Scan', icon: Search },
      { key: 'text_extraction', label: 'Extract', icon: FileText },
      { key: 'classification', label: 'Classify', icon: Zap },
      { key: 'embedding', label: 'Embed', icon: Activity },
      { key: 'indexing', label: 'Index', icon: Search },
      { key: 'completed', label: 'Done', icon: CheckCircle },
    ];

    // If out of sync, show all stages as completed
    const effectiveStage = isOutOfSync ? 'completed' : currentStage;
    const currentIndex = stages.findIndex(s => s.key === effectiveStage);

    return (
      <div className="flex items-center gap-1 mt-2">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const isCompleted = idx < currentIndex || effectiveStage === 'completed';
          const isCurrent = idx === currentIndex && effectiveStage !== 'completed' && effectiveStage !== 'failed';
          const isFailed = effectiveStage === 'failed' && idx === currentIndex;

          return (
            <React.Fragment key={stage.key}>
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                  isOutOfSync && isCompleted
                    ? 'bg-orange-500 text-white'
                    : isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-500 text-white animate-pulse'
                    : isFailed
                    ? 'bg-red-500 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
                title={stage.label}
              >
                <Icon className="h-3 w-3" />
              </div>
              {idx < stages.length - 1 && (
                <div
                  className={`h-0.5 w-3 ${
                    isOutOfSync && isCompleted 
                      ? 'bg-orange-500' 
                      : isCompleted 
                      ? 'bg-green-500' 
                      : 'bg-muted'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  React.useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [refresh]);

  // Count out-of-sync items
  const outOfSyncCount = processingQueue.filter((item: ProcessingQueueItem) => 
    item.stage !== 'completed' && item.stage !== 'failed' && isActuallyProcessed(item)
  ).length;

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Processing Pipeline</h2>
          <p className="text-muted-foreground">Document processing and search indexing status</p>
        </div>
        <div className="flex items-center gap-2">
          {outOfSyncCount > 0 && (
            <Button 
              onClick={syncQueueWithDocuments} 
              variant="default" 
              className="gap-2 bg-orange-500 hover:bg-orange-600"
            >
              <AlertTriangle className="h-4 w-4" />
              Sync {outOfSyncCount} Items
            </Button>
          )}
          <Button onClick={refresh} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sync Warning Banner */}
      {outOfSyncCount > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <p className="font-medium text-orange-400">Queue Out of Sync</p>
                <p className="text-sm text-muted-foreground">
                  {outOfSyncCount} document{outOfSyncCount > 1 ? 's are' : ' is'} showing as pending but already processed. 
                  Click "Sync" to update the queue status.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Performance Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold">{successRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Timer className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold">{avgProcessingTime > 0 ? `${avgProcessingTime.toFixed(1)}s` : 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Avg Processing Time</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold">{processingQueue.length}</p>
                <p className="text-xs text-muted-foreground">Total in Queue</p>
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

      {/* Processing Queue with Tabs */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Document Processing Queue
            </CardTitle>
            <div className="flex items-center gap-2">
              {stats.processing.completed > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCompleted}
                  className="gap-1 text-xs"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear Completed
                </Button>
              )}
              {processingQueue.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  className="gap-1 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="all" className="text-xs">
                All ({processingQueue.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs">
                Pending ({stats.processing.pending})
              </TabsTrigger>
              <TabsTrigger value="processing" className="text-xs">
                Processing ({stats.processing.inProgress})
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs">
                Completed ({stats.processing.completed})
              </TabsTrigger>
              <TabsTrigger value="failed" className="text-xs">
                Failed ({stats.processing.failed})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {getFilteredItems().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No documents in {activeTab === 'all' ? 'processing queue' : `${activeTab} status`}</p>
                  <p className="text-xs mt-2">Upload documents to see them processed here</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {getFilteredItems().map((item) => {
                      const isOutOfSync = item.stage !== 'completed' && item.stage !== 'failed' && isActuallyProcessed(item);
                      const isExpanded = expandedItems.has(item.id);
                      
                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg border bg-card ${isOutOfSync ? 'border-orange-500/50' : ''}`}
                        >
                          <div className="flex items-center gap-4">
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
                                {isOutOfSync && (
                                  <Badge className="bg-orange-500/20 text-orange-400 text-xs gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Out of Sync
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={getStageColor(isOutOfSync ? 'completed' : item.stage)}>
                                  {item.stage === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                                  {!isOutOfSync && item.stage !== 'completed' && item.stage !== 'failed' && item.started_at && (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  )}
                                  {isOutOfSync ? 'Actually Completed' : getStageLabel(item.stage)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              
                              {/* Visual Pipeline Stages */}
                              {renderPipelineStages(item.stage, isOutOfSync)}
                              
                              {item.stage !== 'completed' && item.stage !== 'failed' && !isOutOfSync && (
                                <Progress value={item.progress_percent || getStageProgress(item.stage)} className="h-1.5 mt-2" />
                              )}
                              
                              {item.last_error && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  {item.last_error}
                                </div>
                              )}
                              
                              {/* Expanded Details */}
                              {isExpanded && (
                                <div className="mt-3 p-2 rounded bg-muted/50 text-xs space-y-1">
                                  <p><span className="text-muted-foreground">Document ID:</span> {item.document_id}</p>
                                  <p><span className="text-muted-foreground">Queue ID:</span> {item.id}</p>
                                  <p><span className="text-muted-foreground">Created:</span> {new Date(item.created_at).toLocaleString()}</p>
                                  {item.started_at && <p><span className="text-muted-foreground">Started:</span> {new Date(item.started_at).toLocaleString()}</p>}
                                  {item.completed_at && <p><span className="text-muted-foreground">Completed:</span> {new Date(item.completed_at).toLocaleString()}</p>}
                                  <p><span className="text-muted-foreground">Attempts:</span> {item.attempts}/{item.max_attempts}</p>
                                  <p><span className="text-muted-foreground">Priority:</span> {item.priority}</p>
                                  {item.documents?.processing_status && (
                                    <p><span className="text-muted-foreground">Doc Status:</span> {item.documents.processing_status}</p>
                                  )}
                                  {item.documents?.extracted_text && (
                                    <p><span className="text-muted-foreground">Has Extracted Text:</span> Yes ({item.documents.extracted_text.length} chars)</p>
                                  )}
                                  {item.documents?.analysis_result && (
                                    <p><span className="text-muted-foreground">Has AI Analysis:</span> Yes</p>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              {/* Expand/Collapse button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setExpandedItems(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(item.id)) {
                                      newSet.delete(item.id);
                                    } else {
                                      newSet.add(item.id);
                                    }
                                    return newSet;
                                  });
                                }}
                                title={isExpanded ? "Collapse details" : "Expand details"}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                              
                              {/* Simulate next stage button */}
                              {item.stage !== 'completed' && item.stage !== 'failed' && !isOutOfSync && (
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
                              {item.stage !== 'completed' && item.stage !== 'failed' && !isOutOfSync && (
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
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Help Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            Pipeline Stages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <span>Uploaded - File received</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span>Virus Scan - Security check</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Text Extraction - OCR/parsing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Classification - AI categorization</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
              <span>Embedding - Vector generation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Indexing - Search index update</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
