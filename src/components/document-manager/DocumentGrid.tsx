import React, { useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
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
  Pin,
  Lock,
  UserMinus,
  Trash2,
  FolderPlus,
  CloudOff,
  CloudDownload,
  RotateCcw,
  Edit
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { StarButton } from '@/components/favorites/StarButton';
import { useQuickAccess } from '@/hooks/useQuickAccess';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckOutDialog } from '@/components/checkinout/CheckOutDialog';
import { TransferOwnershipDialog } from '@/components/ownership/TransferOwnershipDialog';
import { useOfflineMode } from '@/hooks/useOfflineMode';
import { MoveToFolderDialog } from './MoveToFolderDialog';
import { DocumentEditorModal } from './DocumentEditorModal';

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
  storage_path?: string;
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

interface DocumentGridProps {
  documents: Document[];
  onDocumentClick: (document: Document) => void;
  onRefresh?: () => void;
}

export const DocumentGrid: React.FC<DocumentGridProps> = ({
  documents,
  onDocumentClick,
  onRefresh
}) => {
  const { toast } = useToast();
  const { pinDocument, unpinDocument, isPinned } = useQuickAccess();
  const { makeDocumentAvailableOffline, isDocumentOffline, removeDocumentFromOffline } = useOfflineMode();
  
  // Check Out and Transfer Dialog states
  const [showCheckOutDialog, setShowCheckOutDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [offlineDocIds, setOfflineDocIds] = useState<Set<string>>(new Set());
  const [showEditorModal, setShowEditorModal] = useState(false);

  // Handle edit document
  const handleEdit = (document: Document) => {
    setSelectedDocument(document);
    setShowEditorModal(true);
  };

  // Check which documents are available offline
  React.useEffect(() => {
    const checkOfflineStatus = async () => {
      const offlineIds = new Set<string>();
      for (const doc of documents) {
        const isOffline = await isDocumentOffline(doc.id);
        if (isOffline) offlineIds.add(doc.id);
      }
      setOfflineDocIds(offlineIds);
    };
    checkOfflineStatus();
  }, [documents, isDocumentOffline]);

  const handleMakeOffline = async (document: Document) => {
    const success = await makeDocumentAvailableOffline(document);
    if (success) {
      setOfflineDocIds(prev => new Set([...prev, document.id]));
    }
  };

  const handleRemoveOffline = async (document: Document) => {
    const success = await removeDocumentFromOffline(document.id);
    if (success) {
      setOfflineDocIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(document.id);
        return newSet;
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
    } catch (error) {
      toast({
        title: "Share failed",
        description: "Could not copy document link",
        variant: "destructive"
      });
    }
  };
  const getFileIcon = (_fileType: string) => {
    // You can expand this based on file types
    return <FileText className="w-8 h-8 text-blue-500" />;
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {documents.map(document => (
        <Card 
          key={document.id} 
          className="group hover:shadow-lg transition-all duration-200 cursor-pointer border hover:border-primary/50 bg-white"
          onClick={() => onDocumentClick(document)}
        >
          <CardContent className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {getFileIcon(document.file_type)}
                {document.insights && (
                  <div className="flex items-center gap-1">
                    <Brain className="w-3 h-3 text-blue-500" />
                    <Star 
                      className={`w-3 h-3 ${getImportanceColor(document.insights.importance_score)}`}
                      fill="currentColor"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Star/Favorite Button */}
                <StarButton 
                  documentId={document.id} 
                  size="sm"
                />
                
                {/* Pin to Quick Access Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPinned(document.id)) {
                            unpinDocument(document.id);
                          } else {
                            pinDocument(document.id);
                          }
                        }}
                      >
                        <Pin 
                          className={`w-4 h-4 transition-all ${
                            isPinned(document.id) 
                              ? 'text-primary fill-primary rotate-45' 
                              : 'text-muted-foreground hover:text-primary'
                          }`}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isPinned(document.id) ? 'Unpin from Quick Access' : 'Pin to Quick Access'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onDocumentClick(document);
                    }}>
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    {(document.metadata as any)?.is_deleted ? (
                      // Recycle bin options
                      <>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(document);
                        }}>
                          <RotateCcw className="w-4 h-4 mr-2" />
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
                          handleEdit(document);
                        }}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
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
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDocument(document);
                          setShowCheckOutDialog(true);
                        }}>
                          <Lock className="w-4 h-4 mr-2" />
                          Check Out
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDocument(document);
                          setShowTransferDialog(true);
                        }}>
                          <UserMinus className="w-4 h-4 mr-2" />
                          Transfer Ownership
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {/* Offline options */}
                        {offlineDocIds.has(document.id) ? (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveOffline(document);
                          }}>
                            <CloudOff className="w-4 h-4 mr-2" />
                            Remove from Offline
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleMakeOffline(document);
                          }}>
                            <CloudDownload className="w-4 h-4 mr-2" />
                            Make Available Offline
                          </DropdownMenuItem>
                        )}
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

            {/* Title */}
            <div className="mb-3">
              <h3 className="font-medium text-sm truncate mb-1">
                {document.insights?.ai_generated_title || document.file_name}
              </h3>
              {document.file_name !== document.insights?.ai_generated_title && (
                <p className="text-xs text-muted-foreground truncate">
                  {document.file_name}
                </p>
              )}
            </div>

            {/* AI Summary */}
            {document.insights?.summary && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {document.insights.summary}
                </p>
              </div>
            )}

            {/* Tags */}
            {document.tags && document.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
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
            )}

            {/* Folders */}
            {document.folders && document.folders.length > 0 && (
              <div className="flex items-center gap-1 mb-3">
                <Folder className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">
                  {document.folders[0].name}
                  {document.folders.length > 1 && ` +${document.folders.length - 1}`}
                </span>
              </div>
            )}

            {/* Key Topics */}
            {document.insights?.key_topics && document.insights.key_topics.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1 mb-1">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Topics:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {document.insights.key_topics.slice(0, 2).map((topic, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                </div>
                <span>{formatFileSize(document.file_size)}</span>
              </div>
              
              {document.insights?.estimated_reading_time && (
                <Badge variant="secondary" className="text-xs">
                  {document.insights.estimated_reading_time}m read
                </Badge>
              )}
            </div>

            {/* Processing Status */}
            {document.processing_status && document.processing_status !== 'completed' && (
              <div className="mt-2">
                <Badge 
                  variant={
                    document.processing_status === 'processing' ? 'secondary' : 
                    document.processing_status === 'pending' ? 'outline' :
                    'destructive'
                  }
                  className="text-xs"
                >
                  {document.processing_status === 'processing' ? 'AI Processing...' : 
                   document.processing_status === 'pending' ? 'Pending Analysis' :
                   'Processing Failed'}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      
      {/* Dialogs */}
      {selectedDocument && (
        <>
          <CheckOutDialog
            open={showCheckOutDialog}
            onOpenChange={setShowCheckOutDialog}
            documentId={selectedDocument.id}
            documentName={selectedDocument.file_name}
            onCheckOutComplete={() => {
              toast({
                title: "Document checked out",
                description: "You can now work on this document exclusively.",
              });
            }}
          />
          
          <TransferOwnershipDialog
            open={showTransferDialog}
            onOpenChange={setShowTransferDialog}
            documentId={selectedDocument.id}
            documentName={selectedDocument.file_name}
          />

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

          <DocumentEditorModal
            isOpen={showEditorModal}
            onClose={() => {
              setShowEditorModal(false);
              setSelectedDocument(null);
            }}
            document={selectedDocument}
            onSave={() => {
              onRefresh?.();
            }}
          />
        </>
      )}
    </div>
  );
};