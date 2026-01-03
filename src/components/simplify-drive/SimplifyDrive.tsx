import React, { useState, useCallback, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/use-toast';
import { useOfflineMode } from '@/hooks/useOfflineMode';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { FeatureNavigation } from './components/FeatureNavigation';
import { SimplifyDriveHeader } from './components/SimplifyDriveHeader';
import { DocumentsView } from './components/DocumentsView';
import { FeatureContent } from './components/FeatureContent';
import { DocumentModals } from './components/DocumentModals';
import { DocumentChatbot } from '../document-manager/DocumentChatbot';
import { DocumentViewer } from '../document-manager/DocumentViewer';
import {
  OfflineDocumentsPanel,
  SyncStatusDialog
} from '../offline';
import { SyncNotificationDialog } from '../offline/SyncNotificationDialog';
import { useDocuments } from './hooks/useDocuments';
import { useDocumentFiltering } from './hooks/useDocumentFiltering';
import type { Document, ViewMode, SortOrder } from './types';

export function SimplifyDrive() {
  const [searchParams] = useSearchParams();

  // Documents & filtering
  const [selectedFolder, setSelectedFolder] = useState('all');
  const { documents, loading, stats, refetch } = useDocuments({ selectedFolder });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  console.log('🔍 SimplifyDrive: documents count:', documents.length, 'selectedFolder:', selectedFolder);

  const { filteredDocuments } = useDocumentFiltering({
    documents,
    searchQuery,
    selectedFolder,
    selectedTag,
    sortBy,
    sortOrder,
  });

  // UI State
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('simplify_drive_view_mode', 'grid');
  const [activeFeature, setActiveFeature] = useState('documents');
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(true);

  // Handle URL parameters for feature switching
  useEffect(() => {
    const feature = searchParams.get('feature');
    if (feature) {
      setActiveFeature(feature);
    }
  }, [searchParams]);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showShortcutDialog, setShowShortcutDialog] = useState(false);
  const [shortcutDocument, setShortcutDocument] = useState<Document | null>(null);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryDocument, setSummaryDocument] = useState<Document | null>(null);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Chatbot State
  const [showChatbot, setShowChatbot] = useState(true);
  const [chatbotMinimized, setChatbotMinimized] = useState(true);

  // Offline State
  const [showOfflinePanel, setShowOfflinePanel] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  const { toast } = useToast();
  const { 
    status: offlineStatus, 
    syncPendingChanges,
    getPendingUploadsData,
    syncSelectedUploads,
    closeSyncDialog,
  } = useOfflineMode();

  // Pending uploads state
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  
  // Track active uploads for processing banner
  const [activeUploadsCount, setActiveUploadsCount] = useState(0);

  // Auto-refresh documents while actively processing or uploading
  React.useEffect(() => {
    const hasProcessingDocs = documents.some(doc => 
      doc.processing_status === 'processing'
    );

    if (hasProcessingDocs || activeUploadsCount > 0) {
      const interval = setInterval(() => {
        refetch();
      }, 2000); // Refresh every 2 seconds

      return () => clearInterval(interval);
    }
  }, [documents, refetch, activeUploadsCount]);

  // Load pending uploads when sync dialog should show
  React.useEffect(() => {
    if (offlineStatus.showSyncDialog) {
      getPendingUploadsData().then(setPendingUploads);
    }
  }, [offlineStatus.showSyncDialog, getPendingUploadsData]);

  // Handle sync all pending documents
  const handleSyncAll = useCallback(async () => {
    try {
      const uploads = await getPendingUploadsData();
      if (uploads.length === 0) {
        toast({
          title: "No pending uploads",
          description: "All documents are already synced",
        });
        return;
      }
      
      // Get all upload IDs
      const allIds = uploads.map(u => u.id);
      
      // Sync all
      await syncSelectedUploads(allIds);
      
      // Refetch documents
      refetch();
      
      toast({
        title: "Sync complete",
        description: `${uploads.length} document(s) synced successfully`,
      });
    } catch (error) {
      console.error('Sync all failed:', error);
      toast({
        title: "Sync failed",
        description: "Failed to sync documents",
        variant: "destructive",
      });
    }
  }, [getPendingUploadsData, syncSelectedUploads, refetch, toast]);

  // Listen for document changes and refetch
  React.useEffect(() => {
    const handleDocumentsChanged = () => {
      console.log('📡 Documents changed event received, refetching...');
      refetch();
    };
    
    // Listen for upload started/completed events
    const handleUploadStarted = (event: CustomEvent) => {
      const count = event.detail?.count || 1;
      console.log('📤 Upload started:', count);
      setActiveUploadsCount(prev => prev + count);
    };
    
    const handleUploadCompleted = (event: CustomEvent) => {
      const count = event.detail?.count || 1;
      console.log('✅ Upload completed:', count);
      setActiveUploadsCount(prev => Math.max(0, prev - count));
      refetch();
    };
    
    window.addEventListener('documents-changed', handleDocumentsChanged);
    window.addEventListener('upload-started', handleUploadStarted as EventListener);
    window.addEventListener('upload-completed', handleUploadCompleted as EventListener);
    
    return () => {
      window.removeEventListener('documents-changed', handleDocumentsChanged);
      window.removeEventListener('upload-started', handleUploadStarted as EventListener);
      window.removeEventListener('upload-completed', handleUploadCompleted as EventListener);
    };
  }, [refetch]);

  // Handlers
  const handleDocumentProcessed = useCallback((_documentId: string) => {
    setShowUploadModal(false);
    refetch();
    toast({
      title: "Document uploaded successfully",
      description: "Your document has been processed and saved",
    });
  }, [refetch, toast]);

  const handleViewDocument = useCallback((doc: Document) => {
    setSelectedDocument(doc);
    setShowDocumentViewer(true);
  }, []);

  const handleDownloadDocument = useCallback((doc: Document) => {
    const downloadUrl = doc.storage_url || doc.storage_path;
    if (downloadUrl) {
      // Create a temporary anchor element to trigger download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "Download started",
        description: `Downloading ${doc.file_name}`,
      });
    } else {
      toast({
        title: "Download failed",
        description: "No storage URL found for this document",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleCreateShortcut = useCallback((doc: Document) => {
    setShortcutDocument(doc);
    setShowShortcutDialog(true);
  }, []);

  const handleGenerateSummary = useCallback((doc: Document) => {
    setSummaryDocument(doc);
    setShowSummaryDialog(true);
  }, []);

  const handleUploadScannedPages = useCallback(async (pages: any[]) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      // Get AI options from the first page (they're all the same)
      const enableRAG = pages[0]?.enableRAG || false;
      const enableClassification = pages[0]?.enableClassification || false;
      const customFileName = pages[0]?.customFileName;

      // Set active uploads count to show processing banner immediately
      setActiveUploadsCount(pages.length);

      toast({
        title: "Uploading documents...",
        description: `${pages.length} document(s) being processed${enableRAG ? ' with RAG indexing' : ''}`,
      });

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        // Convert object URL or data URL to blob
        const response = await fetch(page.fullImage);
        const blob = await response.blob();

        // Use custom file name if provided
        const finalFileName = pages.length === 1 
          ? `${customFileName || 'scanned'}.pdf`
          : `${customFileName || 'scanned'}_page${i + 1}.pdf`;

        // If RAG or classification is enabled, use backend processing
        if (enableRAG || enableClassification) {
          try {
            // Convert blob to base64
            const reader = new FileReader();
            const fileBase64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            // Use the same endpoint as regular upload
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
            
            const analysisResponse = await fetch(`${backendUrl}/api/v1/analyze-document`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentData: fileBase64,
                documentName: finalFileName,
                task: 'without_template_extraction',
                userId: user.data.user.id,
                saveToDatabase: true,
                yoloSignatureEnabled: false,
                yoloFaceEnabled: false,
                metadata: {
                  source: 'scanner',
                  page_number: page.pageNumber,
                  rotation: page.rotation,
                }
              }),
            });

            if (!analysisResponse.ok) {
              throw new Error('Backend processing failed');
            }

            console.log(`Scanned page ${i + 1} processed and saved via backend`);
            
            // Update active uploads count as each completes
            setActiveUploadsCount(prev => Math.max(0, prev - 1));
            
            // Refetch after each upload completes to show new document
            refetch();
          } catch (e) {
            console.error('Backend processing failed:', e);
            setActiveUploadsCount(prev => Math.max(0, prev - 1));
            throw e;
          }
        } else {
          // Simple upload without AI processing
          const file = new File([blob], finalFileName, { type: blob.type || 'application/pdf' });
          const storagePath = `${user.data.user.id}/${Date.now()}_${finalFileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, file);

          if (uploadError) {
            setActiveUploadsCount(prev => Math.max(0, prev - 1));
            throw uploadError;
          }

          const { error: insertError } = await supabase
            .from('documents')
            .insert({
              user_id: user.data.user.id,
              file_name: finalFileName,
              file_type: blob.type || 'application/pdf',
              file_size: file.size,
              storage_path: storagePath,
              processing_status: 'completed',
              metadata: {
                source: 'scanner',
                page_number: page.pageNumber,
                rotation: page.rotation,
              }
            });

          if (insertError) {
            setActiveUploadsCount(prev => Math.max(0, prev - 1));
            throw insertError;
          }
          
          // Update count and refetch
          setActiveUploadsCount(prev => Math.max(0, prev - 1));
          refetch();
        }
      }

      // Ensure uploads count is reset
      setActiveUploadsCount(0);
      
      // Final refetch to ensure all documents are shown
      refetch();
      
      toast({
        title: "Upload complete!",
        description: `${pages.length} document(s) uploaded successfully`,
      });
    } catch (error) {
      console.error('Failed to upload scanned documents:', error);
      setActiveUploadsCount(0);
      throw error;
    }
  }, [refetch, toast]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading documents...</div>
      </div>
    );
  }

  const isDocumentsView = activeFeature === 'documents';
  
  // Check for actively processing documents (only 'processing' status, not 'pending')
  // 'pending' is the default status for all documents, so we only show banner for actual active processing
  const processingDocs = documents.filter(doc => 
    doc.processing_status === 'processing'
  );
  
  // Total processing count: backend processing + active uploads
  const totalProcessingCount = processingDocs.length + activeUploadsCount;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Feature Navigation */}
      <FeatureNavigation
        activeFeature={activeFeature}
        onFeatureChange={setActiveFeature}
      />

      {/* Processing Indicator Banner */}
      {isDocumentsView && totalProcessingCount > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 px-4 py-2">
          <div className="flex items-center justify-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>
              Processing {totalProcessingCount} document{totalProcessingCount > 1 ? 's' : ''} in the background...
            </span>
          </div>
        </div>
      )}

      {/* Header - Only show on documents view */}
      {isDocumentsView && (
        <SimplifyDriveHeader
          stats={stats}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          aiInsightsEnabled={aiInsightsEnabled}
          onAiInsightsToggle={() => setAiInsightsEnabled(!aiInsightsEnabled)}
          onUpload={() => setShowUploadModal(true)}
          onScan={() => setShowScannerModal(true)}
          onChatbot={() => setShowChatbot(true)}
          onOfflinePanel={() => setShowOfflinePanel(true)}
          onSync={handleSyncAll}
          isOnline={offlineStatus.isOnline}
          offlineCount={offlineStatus.offlineDocumentCount}
          pendingSyncCount={offlineStatus.pendingUploadCount}
          isSyncing={offlineStatus.isSyncing}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {isDocumentsView ? (
          <DocumentsView
            documents={filteredDocuments}
            viewMode={viewMode}
            aiInsightsEnabled={aiInsightsEnabled}
            selectedFolder={selectedFolder}
            onFolderSelect={(folderId) => {
              console.log('📁 SimplifyDrive: Folder selected:', folderId);
              setSelectedFolder(folderId);
            }}
            onDocumentClick={handleViewDocument}
            onRefresh={refetch}
          />
        ) : (
          <FeatureContent
            activeFeature={activeFeature}
            documents={documents}
            onViewDocument={handleViewDocument}
            onDownloadDocument={handleDownloadDocument}
          />
        )}
      </div>

      {/* Modals */}
      <DocumentModals
        showUploadModal={showUploadModal}
        onCloseUploadModal={() => setShowUploadModal(false)}
        onDocumentProcessed={handleDocumentProcessed}
        showScannerModal={showScannerModal}
        onCloseScannerModal={() => setShowScannerModal(false)}
        onUploadScannedPages={handleUploadScannedPages}
        showShortcutDialog={showShortcutDialog}
        onCloseShortcutDialog={() => setShowShortcutDialog(false)}
        shortcutDocument={shortcutDocument}
        showSummaryDialog={showSummaryDialog}
        onCloseSummaryDialog={() => setShowSummaryDialog(false)}
        summaryDocument={summaryDocument}
      />

      {/* RAG AI Chatbot - Fixed position */}
      {showChatbot && (
        <DocumentChatbot
          onClose={() => setShowChatbot(false)}
          isMinimized={chatbotMinimized}
          onToggleMinimize={() => setChatbotMinimized(!chatbotMinimized)}
        />
      )}

      {/* Document Viewer Dialog */}
      <DocumentViewer
        document={selectedDocument}
        isOpen={showDocumentViewer}
        onClose={() => {
          setShowDocumentViewer(false);
          setSelectedDocument(null);
        }}
      />

      {/* Offline Documents Panel */}
      <OfflineDocumentsPanel
        isOpen={showOfflinePanel}
        onClose={() => setShowOfflinePanel(false)}
      />

      {/* Sync Status Dialog */}
      <SyncStatusDialog
        isOpen={showSyncDialog}
        onClose={() => setShowSyncDialog(false)}
      />

      {/* Sync Notification Dialog */}
      <SyncNotificationDialog
        open={offlineStatus.showSyncDialog}
        onOpenChange={closeSyncDialog}
        pendingUploads={pendingUploads}
        onSync={syncSelectedUploads}
        onDismiss={closeSyncDialog}
      />
    </div>
  );
}
