import React from 'react';
import { renderAsync } from 'docx-preview';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, X, Tags, ChevronRight, ChevronLeft, CloudOff, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DocumentMetadataEditor } from '@/components/metadata';
import { useContentAccessRules } from '@/hooks/useContentAccessRules';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { initOfflineDB } from '@/services/offlineStorage';
import { useDocumentLock } from '@/hooks/useDocumentLock';
import { DocumentLockBanner } from '@/components/version-control/DocumentLockBanner';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  storage_url?: string;
  storage_path?: string;
}

interface DocumentViewerProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  isOpen,
  onClose
}) => {
  const [imageObjectUrl, setImageObjectUrl] = React.useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = React.useState(false);
  const [resolvedUrl, setResolvedUrl] = React.useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = React.useState(false);
  const [showMetadata, setShowMetadata] = React.useState(false);
  const [isOfflineDocument, setIsOfflineDocument] = React.useState(false);
  const docxContainerRef = React.useRef<HTMLDivElement>(null);
  const [isLoadingDocx, setIsLoadingDocx] = React.useState(false);

  // Use document lock hook
  const {
    lock,
    isLockedByCurrentUser,
    canEdit,
    notifications,
    isLoading: isLockLoading,
    lockDocument,
    unlockDocument,
    markNotificationRead,
    refreshLock
  } = useDocumentLock({
    documentId: document?.id || '',
    autoRefresh: true
  });

  // Check file type more accurately - prioritize file extension
  const fileName = (document?.file_name || '').toLowerCase();
  const fileExt = fileName.split('.').pop() || '';

  // Image extensions - check extension FIRST, it's more reliable
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'];
  const isImage = imageExtensions.includes(fileExt);

  // PDF check - only if NOT an image
  const isPDF = !isImage && (fileExt === 'pdf' || document?.file_type === 'application/pdf');

  // DOCX check - Word document
  const isDocx = !isImage && !isPDF && (fileExt === 'docx' || document?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  // Check if document is available offline and load from IndexedDB
  React.useEffect(() => {
    if (!isOpen || !document?.id) {
      console.log('⏭️ Document loading skipped:', { isOpen, hasDocId: !!document?.id });
      setResolvedUrl(null);
      setIsOfflineDocument(false);
      return;
    }

    const loadDocument = async () => {
      setIsLoadingUrl(true);

      console.log('🔍 DocumentViewer loading document:', {
        id: document.id,
        file_name: document.file_name,
        storage_path: document.storage_path,
        file_type: document.file_type
      });

      try {
        // First, try to load from offline storage
        const db = await initOfflineDB();
        const offlineDoc = await db.get('documents', document.id);

        console.log('📦 Offline document check:', {
          found: !!offlineDoc,
          has_blob: !!offlineDoc?.blob_data,
          blob_size: offlineDoc?.blob_data?.size || 0,
          blob_type: offlineDoc?.blob_data?.type || 'none'
        });

        if (offlineDoc?.blob_data) {
          console.log('✅ Loading document from offline storage blob');
          const blobUrl = URL.createObjectURL(offlineDoc.blob_data);
          setResolvedUrl(blobUrl);
          setIsOfflineDocument(true);
          setIsLoadingUrl(false);
          return;
        } else {
          console.log('⚠️ Document found but no blob_data available');
        }
      } catch (error) {
        console.error('❌ Error checking offline storage:', error);
      }

      // If not offline or failed, try to load from server
      if (!document.storage_path) {
        console.error('No storage path available');
        setResolvedUrl(null);
        setIsLoadingUrl(false);
        return;
      }

      try {
        console.log('🔗 Creating signed URL from storage_path:', document.storage_path);
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(document.storage_path, 3600);

        if (error) {
          console.error('❌ Failed to generate signed URL:', error);
          setResolvedUrl(null);
        } else if (data?.signedUrl) {
          console.log('✅ Signed URL generated:', data.signedUrl.substring(0, 100) + '...');
          setResolvedUrl(data.signedUrl);
          setIsOfflineDocument(false);
        }
      } catch (err) {
        console.error('❌ Error generating signed URL:', err);
        setResolvedUrl(null);
      } finally {
        setIsLoadingUrl(false);
      }
    };

    loadDocument();
  }, [isOpen, document?.id, document?.storage_path]);

  // Fetch image as blob to bypass CORS issues
  React.useEffect(() => {
    // Always run cleanup
    if (!isOpen || !document || !isImage || !resolvedUrl) {
      return;
    }

    setIsLoadingImage(true);
    fetch(resolvedUrl)
      .then(response => response.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        setImageObjectUrl(url);
        setIsLoadingImage(false);
      })
      .catch(error => {
        console.error('Failed to load image:', error);
        setIsLoadingImage(false);
      });
  }, [document?.id, resolvedUrl, isImage, isOpen]);

  // Render DOCX document
  React.useEffect(() => {
    console.log('📄 DOCX render effect:', {
      isOpen,
      isDocx,
      resolvedUrl: !!resolvedUrl,
      containerRef: !!docxContainerRef.current,
      fileName,
      fileExt
    });

    if (!isOpen || !isDocx || !resolvedUrl) {
      console.log('⏭️ Skipping DOCX render:', { isOpen, isDocx, resolvedUrl: !!resolvedUrl });
      return;
    }

    // Wait for container to be available
    if (!docxContainerRef.current) {
      console.log('⏳ Container not ready yet, will retry...');
      return;
    }

    const renderDocx = async () => {
      try {
        console.log('🔄 Starting DOCX render from:', resolvedUrl);
        setIsLoadingDocx(true);
        const response = await fetch(resolvedUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        console.log('📦 DOCX blob loaded, size:', arrayBuffer.byteLength);
        
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = '';
          console.log('🎨 Rendering DOCX into container...');
          
          await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
            className: 'docx-preview-content',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            debug: true,
            experimental: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
            useBase64URL: true,
          });
          
          console.log('✅ DOCX rendered successfully, container HTML length:', docxContainerRef.current.innerHTML.length);
          console.log('📊 Container children count:', docxContainerRef.current.children.length);
        }
        setIsLoadingDocx(false);
      } catch (error) {
        console.error('❌ Error rendering DOCX:', error);
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = '<p style="color: red; padding: 20px;">Failed to render document: ' + (error instanceof Error ? error.message : String(error)) + '</p>';
        }
        setIsLoadingDocx(false);
      }
    };

    // Small delay to ensure container is mounted
    const timeoutId = setTimeout(renderDocx, 100);
    return () => clearTimeout(timeoutId);
  }, [isOpen, isDocx, resolvedUrl]);

  // Cleanup object URL when component unmounts or dialog closes
  React.useEffect(() => {
    return () => {
      if (imageObjectUrl) {
        URL.revokeObjectURL(imageObjectUrl);
        setImageObjectUrl(null);
      }
      // Also cleanup resolvedUrl if it's an offline blob URL
      if (resolvedUrl && isOfflineDocument) {
        URL.revokeObjectURL(resolvedUrl);
        setResolvedUrl(null);
      }
    };
  }, [imageObjectUrl, resolvedUrl, isOfflineDocument, isOpen]);

  // Debug log
  React.useEffect(() => {
    if (document) {
      console.log('📋 Document viewer:', {
        fileName: document.file_name,
        fileType: document.file_type,
        fileExt,
        isImage,
        isPDF,
        isDocx,
        storagePath: document.storage_path
      });
    }
  }, [document?.id, fileExt, isImage, isPDF, isDocx]);

  const handleDownload = async () => {
    if (!resolvedUrl) return;

    try {
      const response = await fetch(resolvedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement('a');
      a.href = url;
      a.download = document?.file_name || 'document';
      globalThis.document.body.appendChild(a);
      a.click();
      globalThis.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const { fetchApplications, applications } = useContentAccessRules();

  // Fetch restrictions when document opens
  React.useEffect(() => {
    if (document?.id) {
      fetchApplications({ documentId: document.id });
    }
  }, [document?.id, fetchApplications]);

  const restrictions = React.useMemo(() => {
    const r = {
      download: false,
      print: false,
      share: false,
      watermark: false
    };

    applications.forEach(app => {
      if (app.actions_applied?.restrict_download) r.download = true;
      if (app.actions_applied?.restrict_print) r.print = true;
      if (app.actions_applied?.restrict_share) r.share = true;
      if (app.actions_applied?.watermark_required) r.watermark = true;
    });

    return r;
  }, [applications]);

  const handleOpenInNewTab = () => {
    if (resolvedUrl) {
      globalThis.open(resolvedUrl, '_blank');
    }
  };

  if (!document) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg font-semibold truncate pr-4">
                {document.file_name}
              </DialogTitle>
              {isOfflineDocument && (
                <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                  <CloudOff className="w-3 h-3" />
                  <span>Offline</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showMetadata ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMetadata(!showMetadata)}
                className="gap-2"
              >
                <Tags className="w-4 h-4" />
                Metadata
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={restrictions.download}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenInNewTab}
                disabled={restrictions.download || restrictions.print || restrictions.share}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Tab
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Lock Status Banner */}
        <div className="px-6">
          <DocumentLockBanner
            lock={lock}
            isLockedByCurrentUser={isLockedByCurrentUser}
            canEdit={canEdit}
            notifications={notifications || []}
            onLock={async () => {
              await lockDocument({
                document_id: document.id,
                expires_in_minutes: 30
              });
              refreshLock();
            }}
            onUnlock={async () => {
              await unlockDocument();
              refreshLock();
            }}
            onDismissNotification={markNotificationRead}
            isLoading={isLockLoading}
            documentId={document.id}
          />
        </div>

        {/* Restrictions Banner */}
        {(restrictions.download || restrictions.print || restrictions.share) && (
          <Alert variant="destructive" className="mx-6 mt-4 mb-0">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Restricted Access</AlertTitle>
            <AlertDescription>
              This document is protected by access rules: {' '}
              {[
                restrictions.download && 'Download Restricted',
                restrictions.print && 'Print Restricted',
                restrictions.share && 'Sharing Restricted'
              ].filter(Boolean).join(', ')}.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-hidden flex">
          {/* Main content area */}
          <div className={`flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 ${showMetadata ? '' : ''}`}>
            {isLoadingUrl ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading document...</p>
              </div>
            ) : !resolvedUrl ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Failed to load document</p>
              </div>
            ) : isPDF ? (
              <iframe
                src={resolvedUrl}
                className="w-full h-full border-0"
                title={document.file_name}
              />
            ) : isImage ? (
              <div className="flex items-center justify-center h-full p-4">
                {isLoadingImage ? (
                  <p className="text-muted-foreground">Loading image...</p>
                ) : imageObjectUrl ? (
                  <img
                    src={imageObjectUrl}
                    alt={document.file_name}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <p className="text-muted-foreground">Failed to load image</p>
                )}
              </div>
            ) : isDocx ? (
              <div className="w-full h-full overflow-auto bg-gray-100 flex justify-center p-8">
                {isLoadingDocx ? (
                  <div className="flex items-center justify-center w-full">
                    <p className="text-muted-foreground">Loading document...</p>
                  </div>
                ) : (
                  <div className="bg-white shadow-lg" style={{ maxWidth: '210mm', width: '100%' }}>
                    <div
                      ref={docxContainerRef}
                      className="docx-viewer-container"
                      style={{
                        padding: '20mm',
                        minHeight: '297mm',
                        fontSize: '12pt',
                        lineHeight: '1.5',
                        fontFamily: 'Calibri, Arial, sans-serif',
                        color: '#000'
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <p className="text-muted-foreground">
                  Preview not available for this file type
                </p>
                <Button onClick={handleDownload} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download to view
                </Button>
              </div>
            )}
          </div>

          {/* Metadata Sidebar */}
          {showMetadata && (
            <div className="w-80 border-l bg-background overflow-y-auto p-4">
              <DocumentMetadataEditor
                documentId={document.id}
                documentName={document.file_name}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
