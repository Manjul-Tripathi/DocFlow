import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  FileText, 
  Eye, 
  Download, 
  Share, 
  MoreHorizontal, 
  Star, 
  Clock, 
  Brain,
  Tag,
  Folder,
  Sparkles,
  Trash2,
  FolderPlus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { MoveToFolderDialog } from './MoveToFolderDialog';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  extracted_text: string;
  processing_status: string;
  metadata: any;
  storage_url?: string;
  insights?: DocumentInsight;
  tags?: DocumentTag[];
  folders?: SmartFolder[];
}

interface DocumentInsight {
  summary: string;
  key_topics: string[];
  importance_score: number;
  estimated_reading_time: number;
  ai_generated_title: string;
  suggested_actions: string[];
}

interface DocumentTag {
  id: string;
  name: string;
  is_ai_suggested: boolean;
  confidence_score: number;
}

interface SmartFolder {
  id: string;
  name: string;
  color: string;
  icon: string;
  document_count: number;
}

interface DocumentListProps {
  documents: Document[];
  onDocumentClick: (document: Document) => void;
  onRefresh?: () => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  onDocumentClick,
  onRefresh
}) => {
  const { toast } = useToast();
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
  const [selectedDocument, setSelectedDocument] = React.useState<Document | null>(null);

  const handleView = (document: Document) => {
    // Trigger the parent click handler which opens the modal viewer
    onDocumentClick(document);
  };

  const handleDownload = async (document: Document) => {
    try {
      if (document.storage_url) {
        // Create download link directly from storage URL
        const response = await fetch(document.storage_url);
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = globalThis.document.createElement('a');
        a.href = url;
        a.download = document.file_name;
        globalThis.document.body.appendChild(a);
        a.click();
        globalThis.document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({
          title: "Download started",
          description: `Downloading ${document.file_name}`,
        });
      } else {
        throw new Error("Storage URL not found");
      }
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: "Could not download the document",
        variant: "destructive"
      });
    }
  };

  const handleShare = async (document: Document) => {
    try {
      if (document.storage_url) {
        await navigator.clipboard.writeText(document.storage_url);
        toast({
          title: "Link copied",
          description: "Document link copied to clipboard",
        });
      } else {
        throw new Error("No shareable link available");
      }
    } catch (_error) {
      toast({
        title: "Share failed",
        description: "Could not copy document link",
        variant: "destructive"
      });
    }
  };

  const handleMoveToFolder = (document: Document) => {
    setSelectedDocument(document);
    setMoveDialogOpen(true);
  };

  const handleDelete = async (document: Document) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${document.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Delete failed');
      
      toast({
        title: "Moved to recycle bin",
        description: `${document.file_name} has been moved to recycle bin`,
      });
      
      // Immediately refresh to update UI
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete failed",
        description: "Could not delete the document",
        variant: "destructive"
      });
    }
  };

  const handleRestore = async (document: Document) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${document.id}/restore`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Restore failed');
      
      toast({
        title: "Document restored",
        description: `${document.file_name} has been restored`,
      });
      
      // Immediately refresh to update UI
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Restore error:', error);
      toast({
        title: "Restore failed",
        description: "Could not restore the document",
        variant: "destructive"
      });
    }
  };

  const handlePermanentDelete = async (document: Document) => {
    if (!confirm(`Permanently delete "${document.file_name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${document.id}/permanent`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Permanent delete failed');
      
      toast({
        title: "Document permanently deleted",
        description: `${document.file_name} has been permanently deleted`,
      });
      
      // Immediately refresh to update UI
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Permanent delete error:', error);
      toast({
        title: "Delete failed",
        description: "Could not permanently delete the document",
        variant: "destructive"
      });
    }
  };

  const getFileIcon = (_fileType: string) => {
    return <FileText className="w-5 h-5 text-blue-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getImportanceColor = (score: number) => {
    if (score >= 0.8) return 'text-red-500';
    if (score >= 0.6) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="space-y-2">
      {documents.map(document => (
        <Card 
          key={document.id} 
          className="group hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-primary/20"
          onClick={() => onDocumentClick(document)}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {/* Icon & AI Indicators */}
              <div className="flex items-center gap-2">
                {getFileIcon(document.file_type)}
                {document.insights && (
                  <div className="flex items-center gap-1">
                    <Brain className="w-4 h-4 text-blue-500" />
                    <Star 
                      className={`w-4 h-4 ${getImportanceColor(document.insights.importance_score)}`}
                      fill="currentColor"
                    />
                  </div>
                )}
              </div>

              {/* Document Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate mb-1">
                      {document.insights?.ai_generated_title || document.file_name}
                    </h3>
                    
                    {document.file_name !== document.insights?.ai_generated_title && (
                      <p className="text-sm text-muted-foreground truncate mb-1">
                        {document.file_name}
                      </p>
                    )}

                    {/* AI Summary */}
                    {document.insights?.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {document.insights.summary}
                      </p>
                    )}

                    {/* Tags & Topics */}
                    <div className="flex items-center gap-4 text-sm">
                      {/* Tags */}
                      {document.tags && document.tags.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Tag className="w-3 h-3 text-muted-foreground" />
                          <div className="flex gap-1">
                            {document.tags.slice(0, 3).map(tag => (
                              <Badge 
                                key={tag.id} 
                                variant="secondary" 
                                className="text-xs flex items-center gap-1"
                              >
                                {tag.is_ai_suggested && <Sparkles className="w-2 h-2" />}
                                {tag.name}
                              </Badge>
                            ))}
                            {document.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{document.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Folders */}
                      {document.folders && document.folders.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Folder className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {document.folders[0].name}
                            {document.folders.length > 1 && ` +${document.folders.length - 1}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side Info */}
                  <div className="flex items-center gap-4 ml-4">
                    {/* Key Topics */}
                    {document.insights?.key_topics && document.insights.key_topics.length > 0 && (
                      <div className="hidden md:flex flex-col items-end">
                        <span className="text-xs text-muted-foreground mb-1">Topics:</span>
                        <div className="flex gap-1">
                          {document.insights.key_topics.slice(0, 2).map((topic, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Document Stats */}
                    <div className="flex flex-col items-end text-sm text-muted-foreground">
                      <div className="flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{formatFileSize(document.file_size)}</span>
                        {document.insights?.estimated_reading_time && (
                          <Badge variant="secondary" className="text-xs">
                            {document.insights.estimated_reading_time}m read
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {(document.metadata as any)?.is_deleted ? (
                            // Recycle bin options
                            <>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleRestore(document);
                              }}>
                                <Share className="w-4 h-4 mr-2" />
                                Restore
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePermanentDelete(document);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Permanently
                              </DropdownMenuItem>
                            </>
                          ) : (
                            // Normal options
                            <>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleView(document);
                              }}>
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(document);
                              }}>
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleShare(document);
                              }}>
                                <Share className="w-4 h-4 mr-2" />
                                Share
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleMoveToFolder(document);
                              }}>
                                <FolderPlus className="w-4 h-4 mr-2" />
                                Move to Folder
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(document);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* Processing Status */}
                {document.processing_status !== 'completed' && (
                  <div className="mt-2">
                    <Badge 
                      variant={document.processing_status === 'processing' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {document.processing_status === 'processing' ? 'AI Processing...' : 'Processing Failed'}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Move to Folder Dialog */}
      {selectedDocument && (
        <MoveToFolderDialog
          isOpen={moveDialogOpen}
          onClose={() => {
            setMoveDialogOpen(false);
            setSelectedDocument(null);
          }}
          documentId={selectedDocument.id}
          documentName={selectedDocument.file_name}
          onMoved={() => {
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};