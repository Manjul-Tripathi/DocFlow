import React, { useState, useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/use-toast';
import { useOfflineMode } from '@/hooks/useOfflineMode';
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
import { useDocuments } from './hooks/useDocuments';
import { useDocumentFiltering } from './hooks/useDocumentFiltering';
import type { Document, ViewMode, SortOrder } from './types';

export function SimplifyDrive() {
  // Documents & filtering
  const [selectedFolder, setSelectedFolder] = useState('all');
  const { documents, loading, stats, refetch } = useDocuments({ selectedFolder });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
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
  const { status: offlineStatus, syncPendingChanges } = useOfflineMode();

  // Handlers
  const handleDocumentProcessed = useCallback((documentId: string) => {
    setShowUploadModal(false);
    refetch();
    toast({
      title: "Document uploaded successfully",
      description: "Your document has been processed and organized automatically",
    });
  }, [refetch, toast]);

  const handleViewDocument = useCallback((doc: Document) => {
    setSelectedDocument(doc);
    setShowDocumentViewer(true);
  }, []);

  const handleDownloadDocument = useCallback((doc: Document) => {
    if (doc.storage_path) {
      window.open(doc.storage_path, '_blank');
    }
  }, []);

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

      toast({
        title: "Uploading scanned documents...",
        description: `Processing ${pages.length} page(s)`,
      });

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        // Convert data URL to blob
        const response = await fetch(page.fullImage);
        const blob = await response.blob();

        // Create file from blob
        const file = new File([blob], page.fileName, { type: blob.type });

        // Upload to Supabase storage
        const fileName = `${user.data.user.id}/${Date.now()}_${page.fileName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, file);

        if (uploadError) {
          throw uploadError;
        }

        // Create document record
        const { error: insertError } = await supabase
          .from('documents')
          .insert({
            user_id: user.data.user.id,
            file_name: page.fileName,
            file_type: blob.type,
            file_size: file.size,
            storage_path: fileName,
            processing_status: 'pending',
            metadata: {
              source: 'scanner',
              page_number: page.pageNumber,
              rotation: page.rotation,
            }
          });

        if (insertError) {
          throw insertError;
        }
      }

      refetch();
      toast({
        title: "Documents uploaded successfully",
        description: `${pages.length} page(s) uploaded and processing started`,
      });
    } catch (error) {
      console.error('Failed to upload scanned documents:', error);
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

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Feature Navigation */}
      <FeatureNavigation 
        activeFeature={activeFeature}
        onFeatureChange={setActiveFeature}
      />

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
          onSync={() => setShowSyncDialog(true)}
          isOnline={offlineStatus.isOnline}
          offlineCount={offlineStatus.offlineDocumentCount}
          pendingSyncCount={offlineStatus.pendingSyncCount}
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
    </div>
  );
}
