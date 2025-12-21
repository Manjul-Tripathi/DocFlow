import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface DocumentListProps {
  documents: Document[];
  onDocumentClick: (document: Document) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  onDocumentClick
}) => {
  const { toast } = useToast();
  const { pinDocument, unpinDocument, isPinned } = useQuickAccess();
  
  // Check Out and Transfer Dialog states
  const [showCheckOutDialog, setShowCheckOutDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);

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
    <div className="space-y-2">
      {documents.map(document => (
        <Card 
          key={document.id} 
          className="group hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-primary/50 bg-white"
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
                      </div>
                    </div>
                  </div>
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
              </div>
            </div>
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
        </>
      )}
    </div>
  );
};