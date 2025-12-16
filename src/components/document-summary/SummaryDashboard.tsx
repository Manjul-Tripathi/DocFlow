import React, { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Sparkles,
  FileText,
  Search,
  Clock,
  Hash,
  BookOpen,
  Briefcase,
  List,
  ClipboardList,
  ChevronRight,
  FolderOpen,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DocumentSummaryPanel } from './DocumentSummaryPanel';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  created_at: string;
  extracted_text?: string;
  processing_status?: string;
}

interface SummaryDashboardProps {
  documents?: Document[];
}

const summaryTypeIcons = {
  brief: BookOpen,
  detailed: FileText,
  executive: Briefcase,
  bullet: List,
  'action-items': ClipboardList,
};

export function SummaryDashboard({ documents = [] }: SummaryDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    return documents.filter(doc =>
      doc.file_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  const processedDocuments = useMemo(() => {
    return documents.filter(doc => 
      doc.processing_status === 'completed' && doc.extracted_text
    );
  }, [documents]);

  const handleSelectDocument = useCallback((doc: Document) => {
    setSelectedDocument(doc);
    setShowSummaryPanel(true);
  }, []);

  const getFileTypeColor = (fileType: string) => {
    if (fileType.includes('pdf')) return 'text-red-500 bg-red-500/10';
    if (fileType.includes('word') || fileType.includes('doc')) return 'text-blue-500 bg-blue-500/10';
    if (fileType.includes('sheet') || fileType.includes('excel')) return 'text-green-500 bg-green-500/10';
    if (fileType.includes('image')) return 'text-purple-500 bg-purple-500/10';
    return 'text-muted-foreground bg-muted';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Document Summaries</h2>
          <p className="text-muted-foreground">
            Generate intelligent summaries powered by AI
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          Powered by AI
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Documents</CardDescription>
            <CardTitle className="text-2xl">{documents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready for Summary</CardDescription>
            <CardTitle className="text-2xl">{processedDocuments.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Summary Types</CardDescription>
            <CardTitle className="text-2xl">5</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Languages</CardDescription>
            <CardTitle className="text-2xl">12+</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Summary Types Info */}
      <div className="grid gap-4 md:grid-cols-5">
        {[
          { id: 'brief', label: 'Brief', desc: '2-3 sentences', icon: BookOpen, color: 'bg-blue-500/10 text-blue-500' },
          { id: 'detailed', label: 'Detailed', desc: 'Full analysis', icon: FileText, color: 'bg-green-500/10 text-green-500' },
          { id: 'executive', label: 'Executive', desc: 'For leaders', icon: Briefcase, color: 'bg-purple-500/10 text-purple-500' },
          { id: 'bullet', label: 'Bullet Points', desc: 'Quick scan', icon: List, color: 'bg-amber-500/10 text-amber-500' },
          { id: 'action-items', label: 'Action Items', desc: 'Tasks & deadlines', icon: ClipboardList, color: 'bg-red-500/10 text-red-500' },
        ].map((type) => {
          const Icon = type.icon;
          return (
            <Card key={type.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2 pt-4">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-2', type.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm">{type.label}</CardTitle>
                <CardDescription className="text-xs">{type.desc}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Document Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Select Document</CardTitle>
              <CardDescription>Choose a document to generate AI summary</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Document List */}
          <ScrollArea className="h-[400px]">
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                <p className="font-medium text-foreground">No documents found</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? 'Try a different search term' : 'Upload documents to get started'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map((doc) => {
                  const isProcessed = doc.processing_status === 'completed' && doc.extracted_text;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => isProcessed && handleSelectDocument(doc)}
                      disabled={!isProcessed}
                      className={cn(
                        'w-full flex items-center gap-3 p-4 rounded-lg text-left transition-all border',
                        isProcessed 
                          ? 'hover:bg-muted hover:border-primary/30 cursor-pointer' 
                          : 'opacity-50 cursor-not-allowed bg-muted/30'
                      )}
                    >
                      <div className={cn('p-2 rounded-lg', getFileTypeColor(doc.file_type))}>
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{doc.file_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(doc.created_at), 'MMM d, yyyy')}
                          </span>
                          {!isProcessed && (
                            <Badge variant="outline" className="text-xs">
                              {doc.processing_status === 'processing' ? (
                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing</>
                              ) : (
                                'Not processed'
                              )}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isProcessed && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Sparkles className="h-3 w-3" />
                            Ready
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Summary Panel Dialog */}
      <Dialog open={showSummaryPanel} onOpenChange={setShowSummaryPanel}>
        <DialogContent className="max-w-2xl h-[85vh] p-0">
          {selectedDocument && (
            <DocumentSummaryPanel
              documentName={selectedDocument.file_name}
              documentText={selectedDocument.extracted_text || ''}
              onClose={() => setShowSummaryPanel(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
