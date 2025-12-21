import React, { useState, useEffect, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path?: string;
  storage_url?: string;
  extracted_text?: string;
  metadata?: any;
}

interface DocumentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document | null;
  onSave?: () => void;
}

const EDITOR_URL = '/editor';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export const DocumentEditorModal: React.FC<DocumentEditorModalProps> = ({
  isOpen,
  onClose,
  document,
  onSave
}) => {
  const { toast } = useToast();
  const editorWindowRef = useRef<Window | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const lastOpenedDocIdRef = useRef<string | null>(null);
  const isOpeningRef = useRef<boolean>(false);
  const editorReadyReceivedRef = useRef<boolean>(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertedDocxUrl, setConvertedDocxUrl] = useState<string | null>(null);
  const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);

  // Open editor in new tab when modal "opens"
  useEffect(() => {
    // Prevent opening if:
    // 1. Modal is not open
    // 2. No document
    // 3. Already opened this document
    // 4. Currently in the process of opening
    // 5. Editor window exists and is not closed
    if (!isOpen || !document) {
      return;
    }

    // If we already opened this document and the window is still open, don't open again
    if (lastOpenedDocIdRef.current === document.id && 
        editorWindowRef.current && 
        !editorWindowRef.current.closed) {
      console.log('Editor already open for this document, skipping');
      return;
    }

    // If we're currently opening, don't open again
    if (isOpeningRef.current) {
      console.log('Editor is currently opening, skipping');
      return;
    }

    // Open the editor
    console.log('Opening editor for document:', document.id);
    isOpeningRef.current = true;
    openEditorInNewTab();
    lastOpenedDocIdRef.current = document.id;
    
    // Reset opening flag after a delay
    setTimeout(() => {
      isOpeningRef.current = false;
    }, 1000);

    return () => {
      // Cleanup when component unmounts
      if (editorWindowRef.current && !editorWindowRef.current.closed) {
        // Let user close the tab manually
      }
    };
  }, [isOpen, document?.id]);

  // Reset tracking when modal closes
  useEffect(() => {
    if (!isOpen) {
      lastOpenedDocIdRef.current = null;
      setEditorReady(false);
      isOpeningRef.current = false;
      editorReadyReceivedRef.current = false;
    }
  }, [isOpen]);

  // Handle messages from the editor window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security check: only accept messages from our editor (same origin)
      if (event.origin !== window.location.origin) return;

      const { type, data } = event.data;

      switch (type) {
        case 'EDITOR_READY':
          // Only process EDITOR_READY once per session
          if (editorReadyReceivedRef.current) {
            console.log('EDITOR_READY already received, ignoring duplicate');
            return;
          }
          editorReadyReceivedRef.current = true;
          console.log('Received EDITOR_READY from child window');
          setEditorReady(true);
          if (document) {
            console.log('Document available, triggering load');
            loadDocumentContent();
          } else {
            console.warn('Received EDITOR_READY but no document is selected');
          }
          break;

        case 'REQUEST_SAVE':
          console.log('Save requested from editor', data);
          handleSaveFromEditor(data);
          break;

        case 'ONLYOFFICE_SAVE_REQUESTED':
          console.log('OnlyOffice save instruction shown');
          toast({
            title: "📥 Save Instructions",
            description: "Use File → Download in the editor, then upload the saved file back to replace the document.",
            duration: 10000,
          });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [document]);

  // Get file type from filename or mime type
  const getFileType = (fileName: string, fileType: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'docx' || ext === 'doc' || fileType.includes('word')) return 'word';
    if (ext === 'pdf' || fileType.includes('pdf')) return 'pdf';
    if (ext === 'txt' || fileType.includes('text')) return 'text';
    if (ext === 'html' || ext === 'htm') return 'html';
    return 'other';
  };

  // Convert PDF to DOCX for editing
  const convertPdfToDocx = async (pdfUrl: string): Promise<string | null> => {
    try {
      setIsConverting(true);
      toast({
        title: "Converting PDF",
        description: "Converting PDF to Word format. This may take a few minutes for large documents...",
        duration: 60000, // Show for 60 seconds
      });

      // Use AbortController with 5 minute timeout for large PDFs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes

      const response = await fetch(`${BACKEND_URL}/api/editor/pdf-to-docx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storage_url: pdfUrl,
          filename: document?.file_name?.replace('.pdf', '.docx') || 'document.docx',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to convert PDF to DOCX');
      }

      // Get the DOCX blob and create object URL
      const docxBlob = await response.blob();
      const docxUrl = URL.createObjectURL(docxBlob);
      
      setConvertedDocxUrl(docxUrl);
      setOriginalPdfUrl(pdfUrl);
      
      toast({
        title: "Conversion complete",
        description: "PDF converted to Word format. Opening editor...",
      });

      return docxUrl;
    } catch (error: any) {
      console.error('PDF to DOCX conversion error:', error);
      const errorMessage = error.name === 'AbortError' 
        ? 'Conversion timed out. The PDF may be too large.'
        : (error.message || "Failed to convert PDF for editing");
      toast({
        title: "Conversion failed",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setIsConverting(false);
    }
  };

  const openEditorInNewTab = async () => {
    if (!document) return;

    const fileType = getFileType(document.file_name, document.file_type || '');
    const isPDF = fileType === 'pdf';
    const isWord = fileType === 'word';

    // For PDFs and Word docs, open directly in OnlyOffice (no conversion needed!)
    if (isPDF || isWord) {
      let docUrl = '';
      const storagePath = (document as any).storage_path || (document as any).file_path;

      if (document.storage_url) {
        docUrl = document.storage_url;
      } else if (storagePath) {
        const { data, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, 3600);

        if (!urlError && data?.signedUrl) {
          docUrl = data.signedUrl;
        }
      }

      if (!docUrl) {
        toast({
          title: "Error",
          description: "Could not get document URL",
          variant: "destructive"
        });
        onClose();
        return;
      }

      // Open OnlyOffice editor directly with the document URL (PDF or DOCX)
      const editorUrl = `${EDITOR_URL}?embedded=true&documentId=${document.id}&name=${encodeURIComponent(document.file_name)}&editorType=onlyoffice&url=${encodeURIComponent(docUrl)}`;

      const newWindow = window.open(editorUrl, '_blank');

      if (newWindow) {
        editorWindowRef.current = newWindow;
        toast({
          title: "OnlyOffice Editor opened",
          description: `${isPDF ? 'PDF' : 'Word'} document opened for editing. Save will download the edited file.`,
        });
      } else {
        toast({
          title: "Popup blocked",
          description: "Please allow popups for this site to use the editor",
          variant: "destructive"
        });
        onClose();
      }
      return;
    }

    // For other file types, use the basic editor
    const editorUrl = `${EDITOR_URL}?embedded=true&documentId=${document.id}&name=${encodeURIComponent(document.file_name)}`;

    const newWindow = window.open(editorUrl, '_blank');

    if (newWindow) {
      editorWindowRef.current = newWindow;
      toast({
        title: "Editor opened",
        description: "Document editor opened in new tab",
      });
    } else {
      toast({
        title: "Popup blocked",
        description: "Please allow popups for this site to use the editor",
        variant: "destructive"
      });
      onClose();
    }
  };

  // Monitor editor window status
  useEffect(() => {
    if (!isOpen || !editorWindowRef.current) return;

    const timer = setInterval(() => {
      if (editorWindowRef.current?.closed) {
        console.log('Editor tab closed, cleaning up');
        onClose();
        editorWindowRef.current = null;
        setEditorReady(false);
        lastOpenedDocIdRef.current = null; // Reset so it can be opened again
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onClose]);

  const sendMessageToEditor = (message: any) => {
    if (editorWindowRef.current && !editorWindowRef.current.closed) {
      console.log('Sending message to editor:', message.type);
      editorWindowRef.current.postMessage(message, window.location.origin);
    } else {
      console.warn('Cannot send message - editor window closed or missing');
    }
  };

  const loadDocumentContent = async () => {
    if (!document) return;

    try {
      // Fetch fresh document data from Supabase
      const { data: freshDoc, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', document.id)
        .single();

      if (error) {
        console.error('Error fetching document:', error);
      }

      const docToUse = freshDoc || document;
      const fileType = getFileType(docToUse.file_name, docToUse.file_type || '');

      // Special handling for PDF files - convert to DOCX for editing in Word editor
      if (fileType === 'pdf') {
        let pdfUrl = '';
        const storagePath = (docToUse as any).storage_path || (docToUse as any).file_path;

        if (docToUse.storage_url) {
          pdfUrl = docToUse.storage_url;
        } else if (storagePath) {
          const { data, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(storagePath, 3600);

          if (!urlError && data?.signedUrl) {
            pdfUrl = data.signedUrl;
          }
        }

        if (pdfUrl) {
          // Convert PDF to DOCX for editing (uses LibreOffice for better quality)
          const docxUrl = await convertPdfToDocx(pdfUrl);
          
          if (docxUrl) {
            // Send converted DOCX URL to Word editor
            sendMessageToEditor({
              type: 'LOAD_DOCUMENT',
              data: {
                id: docToUse.id,
                name: docToUse.file_name.replace('.pdf', '.docx'),
                wordUrl: docxUrl,
                originalPdfUrl: pdfUrl,
                convertedFromPdf: true
              }
            });
          } else {
            toast({
              title: "Conversion failed",
              description: "Could not convert PDF for editing. Try again later.",
              variant: "destructive"
            });
          }
        }
        return;
      }

      // Special handling for Word files
      if (fileType === 'word') {
        let wordUrl = '';
        const storagePath = (docToUse as any).storage_path || (docToUse as any).file_path;

        if (docToUse.storage_url) {
          wordUrl = docToUse.storage_url;
        } else if (storagePath) {
          const { data, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(storagePath, 3600);

          if (!urlError && data?.signedUrl) {
            wordUrl = data.signedUrl;
          }
        }

        if (wordUrl) {
          sendMessageToEditor({
            type: 'LOAD_DOCUMENT',
            data: {
              id: docToUse.id,
              name: docToUse.file_name,
              wordUrl: wordUrl
            }
          });
        }
        return;
      }

      // Default handling for text-based files
      let content = docToUse.metadata?.editor_content || '';

      if (!content && docToUse.extracted_text) {
        content = docToUse.extracted_text
          .split(/\n\n+/)
          .map((para: string) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
          .join('');
      }

      if (!content) {
        content = '<p>Start editing your document...</p>';
      }

      sendMessageToEditor({
        type: 'LOAD_DOCUMENT',
        data: {
          id: docToUse.id,
          name: docToUse.file_name,
          content: content
        }
      });

    } catch (error) {
      console.error('Error loading document:', error);
      toast({
        title: "Error loading document",
        description: "Could not load document content for editing",
        variant: "destructive"
      });
    }
  };

  const handleSaveFromEditor = async (data: { html: string; text: string }) => {
    if (!document) return;

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const content = data.html;
      const textContent = data.text;

      let versionNumber = 1;
      if (document.metadata?.current_version) {
        versionNumber = document.metadata.current_version + 1;
      }

      // Update document metadata
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          extracted_text: textContent,
          metadata: {
            ...(document.metadata || {}),
            last_edited_at: new Date().toISOString(),
            last_edited_by: user.user.id,
            current_version: versionNumber,
            editor_content: content,
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (updateError) throw updateError;

      // Send confirmation back to editor
      sendMessageToEditor({
        type: 'DOCUMENT_SAVED',
        data: {
          html: content,
          text: textContent
        }
      });

      toast({
        title: "Document saved",
        description: `Changes saved successfully`,
      });

      if (onSave) onSave();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Save failed",
        description: error.message || "Could not save document changes",
        variant: "destructive"
      });
    }
  };

  return null;
};
