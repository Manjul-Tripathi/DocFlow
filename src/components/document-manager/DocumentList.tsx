import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
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
  Edit,
  Shield,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Circle,
  FolderPlus,
  CloudUpload
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
import { DocumentEditorModal } from './DocumentEditorModal';
import { ApplyComplianceLabelDialog } from '@/components/compliance/ApplyComplianceLabelDialog';

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
  const { pinDocument, unpinDocument, isPinned } = useQuickAccess();
  
  // Check Out and Transfer Dialog states
  const [showCheckOutDialog, setShowCheckOutDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showComplianceDialog, setShowComplianceDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);
  
  // Delete confirmation dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [focusedDocumentId, setFocusedDocumentId] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Keyboard delete handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selectedDocuments.size > 0) {
        const document = documents.find(d => selectedDocuments.has(d.id));
        if (document) {
          event.preventDefault();
          initiateDelete(document);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDocuments, documents]);

  const initiateDelete = (document: Document) => {
    setDocumentToDelete(document);
    if ((document.metadata as any)?.is_deleted) {
      setShowPermanentDeleteDialog(true);
    } else {
      setShowDeleteDialog(true);
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;
    
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${documentToDelete.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Delete failed');
      
      toast({
        title: "Moved to recycle bin",
        description: `${documentToDelete.file_name} has been moved to recycle bin`,
      });
      
      setShowDeleteDialog(false);
      setDocumentToDelete(null);
      setSelectedDocuments(new Set());
      
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

  const handlePermanentDelete = async () => {
    if (!documentToDelete) return;
    
    try {
      const response = await fetch(`http://localhost:8000/api/v1/documents/${documentToDelete.id}/permanent`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Permanent delete failed');
      
      toast({
        title: "Document permanently deleted",
        description: `${documentToDelete.file_name} has been permanently deleted`,
      });
      
      setShowPermanentDeleteDialog(false);
      setDocumentToDelete(null);
      setSelectedDocuments(new Set());
      
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

  // Handle edit document
  const handleEdit = (document: Document) => {
    setSelectedDocument(document);
    setShowEditorModal(true);
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
    } catch (_error) {
      toast({
        title: "Share failed",
        description: "Could not copy document link",
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
    <div className="space-y-4" ref={listRef}>
      {/* Bulk Action Bar */}
      {selectedDocuments.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex-1">
            <span className="text-sm font-semibold text-blue-900">{selectedDocuments.size} selected</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const doc = documents.find(d => selectedDocuments.has(d.id));
              if (doc) {
                const starred = isPinned(doc.id);
                selectedDocuments.forEach(docId => {
                  const document = documents.find(d => d.id === docId);
                  if (document) {
                    if (starred) {
                      unpinDocument(document.id);
                    } else {
                      pinDocument(document);
                    }
                  }
                });
              }
            }}
            className="text-amber-600 hover:text-amber-700"
          >
            <Star className="w-4 h-4 mr-1" />
            Favorite
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstDoc = documents.find(d => selectedDocuments.has(d.id));
              if (firstDoc) handleDownload(firstDoc);
            }}
          >
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstDoc = documents.find(d => selectedDocuments.has(d.id));
              if (firstDoc) handleMoveToFolder(firstDoc);
            }}
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            Move
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstDoc = documents.find(d => selectedDocuments.has(d.id));
              if (firstDoc) initiateDelete(firstDoc);
            }}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDocuments(new Set())}
          >
            ×
          </Button>
        </div>
      )}

      {/* Documents List */}
      <div className="space-y-2">
      {documents.map(document => (
        <ContextMenu key={document.id}>
          <ContextMenuTrigger asChild>
            <Card 
              className={`group hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-primary/50 relative ${
                selectedDocuments.has(document.id) ? 'border-primary border-2 bg-primary/5' : 'bg-white'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDocuments(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(document.id)) {
                    newSet.delete(document.id);
                  } else {
                    newSet.add(document.id);
                  }
                  return newSet;
                });
              }}
              tabIndex={0}
            >
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDocuments(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(document.id)) {
                      newSet.delete(document.id);
                    } else {
                      newSet.add(document.id);
                    }
                    return newSet;
                  });
                }}
                className="text-primary hover:text-primary/80 transition-colors flex-shrink-0"
              >
                {selectedDocuments.has(document.id) ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
              </button>

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
                    <div className="flex items-center gap-1">
                      {/* Always visible Star and Pin buttons */}
                      <StarButton 
                        documentId={document.id} 
                        size="sm"
                      />
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-primary/10"
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
                      
                      {/* Action Buttons - Always visible */}
                      <div className="flex items-center gap-1">
                        {/* Primary Actions */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleView(document);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>View</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-green-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(document);
                                }}
                              >
                                <Edit className="w-4 h-4 text-green-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Edit</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(document);
                                }}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Download</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShare(document);
                                }}
                              >
                                <Share className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Share</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <div className="w-px h-6 bg-gray-200 mx-1"></div>
                        
                        {/* Document Management */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDocument(document);
                                  setShowCheckOutDialog(true);
                                }}
                              >
                                <Lock className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Check Out</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDocument(document);
                                  setShowTransferDialog(true);
                                }}
                              >
                                <UserMinus className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Transfer</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDocument(document);
                                  setShowComplianceDialog(true);
                                }}
                              >
                                <Shield className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Compliance Labels</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Processing Status */}
                {(document.metadata as any)?.is_pending_upload ? (
                  <div className="mt-2">
                    <Badge 
                      variant="outline"
                      className="text-xs text-orange-600 border-orange-400 bg-orange-50"
                    >
                      <CloudUpload className="w-3 h-3 mr-1" />
                      Queued for Upload
                    </Badge>
                  </div>
                ) : document.processing_status && document.processing_status !== 'completed' && (
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
              </div>
            </div>
          </CardContent>
        </Card>
          </ContextMenuTrigger>
          
          {/* Right-click context menu - Full menu matching dropdown */}
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => onDocumentClick(document)}>
              <Eye className="w-4 h-4 mr-2" />
              View
            </ContextMenuItem>
            {(document.metadata as any)?.is_deleted ? (
              <>
                <ContextMenuItem onClick={() => handleRestore(document)}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem 
                  onClick={() => initiateDelete(document)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Permanently
                </ContextMenuItem>
              </>
            ) : (
              <>
                <ContextMenuItem onClick={() => handleEdit(document)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleDownload(document)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleShare(document)}>
                  <Share className="w-4 h-4 mr-2" />
                  Share
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => {
                  setSelectedDocument(document);
                  setShowCheckOutDialog(true);
                }}>
                  <Lock className="w-4 h-4 mr-2" />
                  Check Out
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  setSelectedDocument(document);
                  setShowTransferDialog(true);
                }}>
                  <UserMinus className="w-4 h-4 mr-2" />
                  Transfer Ownership
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  setSelectedDocument(document);
                  setShowComplianceDialog(true);
                }}>
                  <Shield className="w-4 h-4 mr-2" />
                  Compliance Labels
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem 
                  onClick={() => initiateDelete(document)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ))}
      
      </div>
      {/* End Documents List */}

      {/* Confirmation Dialogs */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Recycle Bin?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move "{documentToDelete?.file_name}" to the recycle bin? You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPermanentDeleteDialog} onOpenChange={setShowPermanentDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{documentToDelete?.file_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-red-600 hover:bg-red-700">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Other Dialogs */}
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
            onSuccess={() => {
              toast({
                title: "Transfer initiated",
                description: "The recipient will be notified to accept or reject the transfer.",
              });
            }}
          />

          <DocumentEditorModal
            isOpen={showEditorModal}
            onClose={() => {
              setShowEditorModal(false);
              setSelectedDocument(null);
            }}
            document={selectedDocument}
          />
          
          <ApplyComplianceLabelDialog
            open={showComplianceDialog}
            onOpenChange={setShowComplianceDialog}
            documentId={selectedDocument.id}
            documentName={selectedDocument.file_name}
            onApply={() => {
              toast({
                title: "Label applied",
                description: "Compliance label has been applied to the document.",
              });
            }}
          />
        </>
      )}
    </div>
  );
};