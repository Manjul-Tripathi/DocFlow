import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UnifiedDocumentUpload } from '@/components/UnifiedDocumentUpload';
import { BatchDocumentScanner } from '@/components/scanning/BatchDocumentScanner';
import { CreateShortcutDialog } from '@/components/shortcuts';
import { DocumentSummaryDialog } from '@/components/document-summary';
import type { Document } from '../types';

interface DocumentModalsProps {
  showUploadModal: boolean;
  onCloseUploadModal: () => void;
  onDocumentProcessed: (documentId: string) => void;
  showScannerModal: boolean;
  onCloseScannerModal: () => void;
  onUploadScannedPages?: (pages: any[]) => Promise<void>;
  showShortcutDialog: boolean;
  onCloseShortcutDialog: () => void;
  shortcutDocument: Document | null;
  showSummaryDialog: boolean;
  onCloseSummaryDialog: () => void;
  summaryDocument: Document | null;
}

export function DocumentModals({
  showUploadModal,
  onCloseUploadModal,
  onDocumentProcessed,
  showScannerModal,
  onCloseScannerModal,
  onUploadScannedPages,
  showShortcutDialog,
  onCloseShortcutDialog,
  shortcutDocument,
  showSummaryDialog,
  onCloseSummaryDialog,
  summaryDocument,
}: DocumentModalsProps) {
  return (
    <>
      <Dialog open={showUploadModal} onOpenChange={onCloseUploadModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
          </DialogHeader>
          <UnifiedDocumentUpload 
            onComplete={() => onDocumentProcessed('uploaded')}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showScannerModal} onOpenChange={onCloseScannerModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Documents</DialogTitle>
          </DialogHeader>
          <BatchDocumentScanner onUploadToStorage={onUploadScannedPages} />
        </DialogContent>
      </Dialog>

      {shortcutDocument && (
        <CreateShortcutDialog
          open={showShortcutDialog}
          onOpenChange={onCloseShortcutDialog}
          documentId={shortcutDocument.id}
          documentName={shortcutDocument.file_name}
        />
      )}

      {summaryDocument && (
        <DocumentSummaryDialog
          open={showSummaryDialog}
          onOpenChange={onCloseSummaryDialog}
          documentName={summaryDocument.file_name}
          documentText={summaryDocument.extracted_text}
        />
      )}
    </>
  );
}
