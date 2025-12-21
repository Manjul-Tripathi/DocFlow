import React, { useEffect, useRef, useState } from 'react';

// Declare the DocumentEditor type
declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: OnlyOfficeConfig) => OnlyOfficeEditor;
    };
  }
}

interface OnlyOfficeEditor {
  destroyEditor: () => void;
  refreshHistory: () => void;
}

interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
  };
  documentType: string;
  editorConfig: {
    callbackUrl?: string;
    mode: string;
    lang: string;
    user?: {
      id: string;
      name: string;
    };
    customization?: {
      autosave?: boolean;
      chat?: boolean;
      comments?: boolean;
      compactHeader?: boolean;
      compactToolbar?: boolean;
      forcesave?: boolean;
      help?: boolean;
      hideRightMenu?: boolean;
      hideRulers?: boolean;
      showReviewChanges?: boolean;
      spellcheck?: boolean;
      toolbarNoTabs?: boolean;
      toolbarHideFileName?: boolean;
      goback?: {
        blank?: boolean;
        text?: string;
        url?: string;
      };
    };
  };
  events?: {
    onAppReady?: () => void;
    onDocumentReady?: () => void;
    onDocumentStateChange?: (event: { data: boolean }) => void;
    onError?: (event: { data: string }) => void;
    onRequestSaveAs?: (event: { data: { url: string; title: string } }) => void;
    onRequestClose?: () => void;
  };
  height?: string;
  width?: string;
  type?: string;
}

interface OnlyOfficeEditorProps {
  documentUrl: string;
  documentId: string;
  documentName: string;
  fileType: string;
  mode?: 'edit' | 'view';
  onSave?: (url: string) => void;
  onClose?: () => void;
  onReady?: () => void;
  onError?: (error: string) => void;
  userId?: string;
  userName?: string;
  callbackUrl?: string;
}

const ONLYOFFICE_SERVER = 'http://localhost:8080';
// Callback URL that OnlyOffice (running in Docker) can reach
// host.docker.internal resolves to the host machine from inside Docker
const CALLBACK_URL = 'http://host.docker.internal:8000/api/editor/onlyoffice-callback';

export const OnlyOfficeEditor: React.FC<OnlyOfficeEditorProps> = ({
  documentUrl,
  documentId,
  documentName,
  fileType,
  mode = 'edit',
  onSave,
  onClose,
  onReady,
  onError,
  userId = 'user1',
  userName = 'User',
  callbackUrl,
}) => {
  const editorRef = useRef<OnlyOfficeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [showSaveButton, setShowSaveButton] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load OnlyOffice script
  useEffect(() => {
    const scriptId = 'onlyoffice-api-script';
    
    // Check if script already exists
    if (document.getElementById(scriptId)) {
      console.log('OnlyOffice script already loaded');
      setScriptLoaded(true);
      return;
    }

    console.log('Loading OnlyOffice API script from:', `${ONLYOFFICE_SERVER}/web-apps/apps/api/documents/api.js`);
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `${ONLYOFFICE_SERVER}/web-apps/apps/api/documents/api.js`;
    script.async = true;
    
    script.onload = () => {
      console.log('OnlyOffice API script loaded successfully');
      setScriptLoaded(true);
    };
    
    script.onerror = (e) => {
      console.error('Failed to load OnlyOffice API script:', e);
      setError(`Failed to load OnlyOffice. Make sure OnlyOffice server is running at ${ONLYOFFICE_SERVER}`);
      setIsLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      // Don't remove script on unmount - it might be needed by other instances
    };
  }, []);

  // Initialize editor when script is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.DocsAPI) {
      console.log('Waiting for script/API...', { scriptLoaded, hasDocsAPI: !!window.DocsAPI });
      return;
    }

    console.log('Initializing OnlyOffice editor with:', {
      documentUrl,
      documentId,
      documentName,
      fileType
    });

    // Generate unique key for document
    const documentKey = `${documentId}_${Date.now()}`;

    // Determine document type
    const getDocumentType = (ext: string): string => {
      const wordTypes = ['doc', 'docx', 'odt', 'rtf', 'txt', 'pdf'];
      const cellTypes = ['xls', 'xlsx', 'ods', 'csv'];
      const slideTypes = ['ppt', 'pptx', 'odp'];
      
      const lowerExt = ext.toLowerCase();
      if (wordTypes.includes(lowerExt)) return 'word';
      if (cellTypes.includes(lowerExt)) return 'cell';
      if (slideTypes.includes(lowerExt)) return 'slide';
      return 'word';
    };

    const config: OnlyOfficeConfig = {
      document: {
        fileType: fileType.replace('.', ''),
        key: documentKey,
        title: documentName,
        url: documentUrl,
      },
      documentType: getDocumentType(fileType),
      editorConfig: {
        // Callback URL for OnlyOffice to send saved documents
        // Uses host.docker.internal so Docker can reach the host machine
        callbackUrl: CALLBACK_URL,
        mode: mode,
        lang: 'en',
        user: {
          id: userId,
          name: userName,
        },
        customization: {
          autosave: true,
          chat: false,
          comments: true,
          compactHeader: true,
          compactToolbar: false,
          forcesave: true,
          help: true,
          hideRightMenu: false,
          hideRulers: false,
          showReviewChanges: false,
          spellcheck: true,
          toolbarNoTabs: false,
          toolbarHideFileName: false,
          goback: {
            blank: false,
            text: 'Go Back',
            url: window.location.origin,
          },
        },
      },
      events: {
        onAppReady: () => {
          console.log('OnlyOffice app ready');
          setIsLoading(false);
        },
        onDocumentReady: () => {
          console.log('OnlyOffice document ready');
          setShowSaveButton(true);
          onReady?.();
        },
        onDocumentStateChange: (event) => {
          console.log('Document state changed:', event.data);
        },
        onError: (event) => {
          console.error('OnlyOffice error:', event.data);
          setError(event.data);
          onError?.(event.data);
        },
        onRequestSaveAs: (event) => {
          console.log('Save as requested:', event.data);
          onSave?.(event.data.url);
        },
        onRequestClose: () => {
          console.log('Close requested');
          onClose?.();
        },
      },
      height: '100%',
      width: '100%',
      type: 'desktop',
    };

    try {
      // Destroy existing editor if any
      if (editorRef.current) {
        editorRef.current.destroyEditor();
      }

      // Create new editor
      editorRef.current = new window.DocsAPI.DocEditor('onlyoffice-editor', config);
      console.log('OnlyOffice editor created');
    } catch (err) {
      console.error('Failed to create OnlyOffice editor:', err);
      setError(`Failed to create editor: ${err}`);
      setIsLoading(false);
    }

    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.destroyEditor();
        } catch (e) {
          console.warn('Error destroying editor:', e);
        }
        editorRef.current = null;
      }
    };
  }, [scriptLoaded, documentUrl, documentId, documentName, fileType, mode, userId, userName, callbackUrl]);

  // Handle manual save to system
  const handleSaveToSystem = async () => {
    if (!editorRef.current || isSaving) return;

    setIsSaving(true);
    
    try {
      // Send message to parent window to trigger save
      const message = {
        type: 'ONLYOFFICE_SAVE_REQUESTED',
        data: {
          documentId,
          documentName,
          message: 'Please use File → Download to save your changes, then upload the file back to replace the document.'
        }
      };

      if (window.opener) {
        window.opener.postMessage(message, window.location.origin);
      }

      // Show instruction to user
      alert('To save your changes:\n\n1. Click "File" → "Download as..." → Choose format (PDF or DOCX)\n2. Save the file to your computer\n3. Close this editor\n4. Upload the saved file to replace the original document');
      
    } catch (err) {
      console.error('Save error:', err);
      alert('Save failed. Please use File → Download to save your changes manually.');
    } finally {
      setIsSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
        <div className="text-red-500 text-xl mb-4">⚠️ OnlyOffice Error</div>
        <div className="text-gray-700 text-center mb-4">{error}</div>
        <div className="text-gray-500 text-sm text-center">
          <p>Make sure OnlyOffice Document Server is running:</p>
          <code className="bg-gray-200 px-2 py-1 rounded mt-2 block">
            cd onlyoffice && docker-compose up -d
          </code>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <div className="text-gray-600">Loading OnlyOffice Editor...</div>
          </div>
        </div>
      )}
      
      <div className="w-full h-full">
        <div id="onlyoffice-editor" className="w-full h-full" />
      </div>
    </>
  );
};

export default OnlyOfficeEditor;
