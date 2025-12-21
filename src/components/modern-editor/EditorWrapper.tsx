import React, { useState, useEffect } from 'react';
import { Editor } from './components/editor';
import { Toolbar } from './components/toolbar';
import { Sidebar } from './components/sidebar';
import { Header } from './components/header';
import { CommentsSidebar } from './components/comments/comments-sidebar';
import { HistorySidebar } from './components/history/history-sidebar';
import { PDFEditor } from './components/pdf-editor/PDFEditor';
import { WordEditor } from './components/word-editor/WordEditor';
import { OnlyOfficeEditor } from './components/onlyoffice-editor/OnlyOfficeEditor';
import useEditorStore from './store/use-editor-store';

function EditorWrapper() {
  const [isCommentsSidebarOpen, setIsCommentsSidebarOpen] = useState(false);
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [editorType, setEditorType] = useState<'text' | 'pdf' | 'word' | 'onlyoffice'>('text');
  const [documentInfo, setDocumentInfo] = useState<{ id?: string; name?: string; url?: string }>({});
  const editorInstance = useEditorStore((state) => state.editor);

  // Check if running in embedded mode (iframe)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embedded = params.get('embedded') === 'true';
    const documentId = params.get('documentId');
    const name = params.get('name');
    const type = params.get('editorType') as 'text' | 'pdf' | 'word' | 'onlyoffice' | null;
    const docUrl = params.get('url'); // Direct URL for OnlyOffice

    setIsEmbedded(embedded);
    // If editor type isn't provided, infer from filename extension
    const inferredType = type || (name ? (name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.doc') ? 'word' : 'text') : 'text');
    setEditorType(inferredType as 'text' | 'pdf' | 'word' | 'onlyoffice');
    setDocumentInfo({ id: documentId || undefined, name: name || undefined, url: docUrl || undefined });

    // If we're in word mode and have a documentId, try to generate a signed URL and send a LOAD_DOCUMENT message
    (async () => {
      try {
        if ((inferredType === 'word' || type === 'word') && documentId) {
          const { supabase } = await import('@/integrations/supabase/client');
          // Fetch document storage path
          const { data: docData, error: docError } = await supabase
            .from('documents')
            .select('storage_path, original_url')
            .eq('id', documentId)
            .single();

          if (docError || !docData) {
            console.warn('Could not fetch document metadata for editor load:', docError);
          } else {
            let url: string | null = null;
            if (docData.storage_path) {
              const { data: signedData, error: signError } = await supabase
                .storage
                .from('documents')
                .createSignedUrl(docData.storage_path, 3600);

              if (!signError && signedData?.signedUrl) {
                url = signedData.signedUrl;
              } else {
                console.warn('Could not create signed URL for document:', signError);
              }
            }

            if (!url && docData.original_url) {
              url = docData.original_url;
            }

            if (url) {
              // Send LOAD_DOCUMENT message (WordEditor listens for this)
              const msg = { type: 'LOAD_DOCUMENT', data: { wordUrl: url, id: documentId, name } };
              if (window.opener) {
                window.opener.postMessage(msg, window.location.origin);
              } else if (window.parent !== window) {
                window.parent.postMessage(msg, '*');
              }
              // Also post to same window so WordEditor receives it
              window.postMessage(msg, window.location.origin);
            }
          }
        }
      } catch (e) {
        console.error('Error preparing word editor load:', e);
      }
    })();

    // Initial setup only - don't send ready signal yet
    // We wait for editorInstance to be ready (for text) or PDFEditor to mount (for pdf)
  }, []);

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security check: only accept messages from same origin if using opener
      if (window.opener && event.origin !== window.location.origin) return;

      const { type, data } = event.data;

      switch (type) {
        case 'LOAD_DOCUMENT':
          // Load document content into editor
          if (editorInstance && data?.content) {
            editorInstance.commands.setContent(data.content);
            setDocumentInfo({ id: data.id, name: data.name });
          }
          break;
        case 'LOAD_CONTENT':
          // Load just content (for version restore)
          if (editorInstance && data?.content) {
            editorInstance.commands.setContent(data.content);
          }
          break;
        case 'REQUEST_SAVE':
          // Parent is requesting to save - send content back
          if (editorInstance) {
            const message = {
              type: 'DOCUMENT_SAVED',
              data: {
                html: editorInstance.getHTML(),
                text: editorInstance.getText()
              }
            };

            if (window.opener) {
              window.opener.postMessage(message, window.location.origin);
            } else if (window.parent !== window) {
              window.parent.postMessage(message, '*');
            }
          }
          break;
        case 'GET_CONTENT':
          // Parent wants current content
          if (editorInstance) {
            const message = {
              type: 'EDITOR_CONTENT',
              data: {
                html: editorInstance.getHTML(),
                text: editorInstance.getText()
              }
            };

            if (window.opener) {
              window.opener.postMessage(message, window.location.origin);
            } else if (window.parent !== window) {
              window.parent.postMessage(message, '*');
            }
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editorInstance]);

  // Notify parent when editor instance is ready - but NOT for word/pdf which handle their own messaging
  useEffect(() => {
    if (editorInstance && isEmbedded && editorType === 'text') {
      console.log('Text Editor instance ready, sending EDITOR_READY');
      if (window.opener) {
        window.opener.postMessage({ type: 'EDITOR_READY' }, window.location.origin);
      } else if (window.parent !== window) {
        window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
      }
    }
  }, [editorInstance, isEmbedded, editorType]);

  return (
    <>
      {editorType === 'onlyoffice' && documentInfo.url ? (
        <div className="h-screen w-full">
          <OnlyOfficeEditor
            documentUrl={documentInfo.url}
            documentId={documentInfo.id || 'unknown'}
            documentName={documentInfo.name || 'Document'}
            fileType={documentInfo.name?.split('.').pop() || 'docx'}
            mode="edit"
            onClose={() => {
              if (window.opener) {
                window.close();
              }
            }}
          />
        </div>
      ) : editorType === 'pdf' ? (
        <PDFEditor documentId={documentInfo.id} documentName={documentInfo.name} />
      ) : editorType === 'word' ? (
        <WordEditor documentId={documentInfo.id} documentName={documentInfo.name} />
      ) : (
        <div className="min-h-screen bg-[#fafbfd]">
          {!isEmbedded && (
            <Header
              onHistoryClick={() => setIsHistorySidebarOpen(true)}
              onCommentsClick={() => setIsCommentsSidebarOpen(true)}
            />
          )}
          {isEmbedded && documentInfo.name && (
            <div className="bg-white border-b px-4 py-2 text-sm text-gray-600">
              Editing: <span className="font-medium text-gray-900">{documentInfo.name}</span>
            </div>
          )}
          <div className="flex">
            <div className="flex-1">
              <Toolbar />
              < Editor />
            </div>
            {!isEmbedded && (
              <div className="flex">
                <Sidebar />
                <CommentsSidebar
                  isOpen={isCommentsSidebarOpen}
                  onClose={() => setIsCommentsSidebarOpen(false)}
                />
                <HistorySidebar
                  isOpen={isHistorySidebarOpen}
                  onClose={() => setIsHistorySidebarOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default EditorWrapper;
