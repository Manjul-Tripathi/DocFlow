import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Zap,
  Pin,
  PinOff,
  TrendingUp,
  Clock,
  FileText,
  Sparkles,
  Eye,
  Download,
  ChevronRight,
  Brain,
  Star,
} from 'lucide-react';
import { useQuickAccess } from '@/hooks/useQuickAccess';
import { formatDistanceToNow } from 'date-fns';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  storage_url?: string | null;
}

interface QuickAccessPanelProps {
  documents: Document[];
  onViewDocument?: (doc: Document) => void;
  onDownloadDocument?: (doc: Document) => void;
}

export const QuickAccessPanel: React.FC<QuickAccessPanelProps> = ({
  documents,
  onViewDocument,
  onDownloadDocument,
}) => {
  const {
    quickAccessItems,
    isLoading,
    pinDocument,
    unpinDocument,
    isPinned,
    getAccessCount,
  } = useQuickAccess();

  // Merge quick access data with documents
  const enrichedDocuments = useMemo(() => {
    return documents.map(doc => {
      const qaItem = quickAccessItems.find(qa => qa.document_id === doc.id);
      return {
        ...doc,
        accessCount: qaItem?.access_count || 0,
        aiScore: qaItem?.ai_score || 0,
        aiReason: qaItem?.ai_reason || null,
        isPinned: qaItem?.is_pinned || false,
        lastAccessed: qaItem?.last_accessed_at,
      };
    });
  }, [documents, quickAccessItems]);

  // Split into pinned and AI-suggested
  const pinnedDocs = enrichedDocuments
    .filter(d => d.isPinned)
    .sort((a, b) => b.accessCount - a.accessCount);

  const aiSuggestedDocs = enrichedDocuments
    .filter(d => !d.isPinned && (d.aiScore > 0 || d.accessCount > 2))
    .sort((a, b) => {
      // Sort by AI score first, then by access count
      if (b.aiScore !== a.aiScore) return b.aiScore - a.aiScore;
      return b.accessCount - a.accessCount;
    })
    .slice(0, 5);

  const frequentDocs = enrichedDocuments
    .filter(d => !d.isPinned && d.accessCount > 0)
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 5);

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    if (type.includes('word') || type.includes('doc')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    return '📁';
  };

  const renderDocumentItem = (doc: typeof enrichedDocuments[0], showAIBadge = false) => (
    <div
      key={doc.id}
      className="group flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-all cursor-pointer border border-transparent hover:border-border"
      onClick={() => onViewDocument?.(doc)}
    >
      <div className="text-2xl">{getFileIcon(doc.file_type)}</div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate text-sm">{doc.file_name}</span>
          {doc.isPinned && (
            <Pin className="h-3 w-3 text-primary shrink-0" />
          )}
          {showAIBadge && doc.aiScore > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    AI
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{doc.aiReason || 'AI suggested based on your usage'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {doc.accessCount > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {doc.accessCount} views
            </span>
          )}
          {doc.lastAccessed && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(doc.lastAccessed), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (doc.isPinned) {
                    unpinDocument(doc.id);
                  } else {
                    pinDocument(doc.id);
                  }
                }}
              >
                {doc.isPinned ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{doc.isPinned ? 'Unpin' : 'Pin to Quick Access'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onDownloadDocument?.(doc);
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pinned Documents */}
      {pinnedDocs.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              Pinned
              <Badge variant="secondary" className="ml-auto">{pinnedDocs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {pinnedDocs.map(doc => renderDocumentItem(doc))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Suggested */}
      {aiSuggestedDocs.length > 0 && (
        <Card className="bg-gradient-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200/50 dark:border-violet-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              AI Suggested
              <Badge variant="secondary" className="ml-auto bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                {aiSuggestedDocs.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {aiSuggestedDocs.map(doc => renderDocumentItem(doc, true))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Frequently Accessed */}
      {frequentDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Frequently Accessed
              <Badge variant="secondary" className="ml-auto">{frequentDocs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {frequentDocs.map(doc => renderDocumentItem(doc))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {pinnedDocs.length === 0 && aiSuggestedDocs.length === 0 && frequentDocs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No Quick Access Items</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Pin documents for quick access or let AI suggest important ones based on your usage.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Pin className="h-3 w-3" />
              <span>Click the pin icon on any document to add it here</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
