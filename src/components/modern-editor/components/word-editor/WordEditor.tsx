import React, { useState, useEffect, useRef } from 'react';
import { renderAsync } from 'docx-preview';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Download, Save, Edit, Eye, History, FileDown } from 'lucide-react';
import { Button } from '../ui/button';
import { exportDocument } from '../../lib/document-export';
import { Editor } from '../editor';
import { Toolbar } from '../toolbar';
import useEditorStore from '../../store/use-editor-store';
import mammoth from 'mammoth';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

interface WordEditorProps {
    documentId?: string;
    documentName?: string;
}

export const WordEditor: React.FC<WordEditorProps> = ({ documentId, documentName }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isWaitingForConversion, setIsWaitingForConversion] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'preview' | 'edit'>('preview');
    const [docxArrayBuffer, setDocxArrayBuffer] = useState<ArrayBuffer | null>(null);
    const [editHtmlContent, setEditHtmlContent] = useState<string | null>(null);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showDownloadDialog, setShowDownloadDialog] = useState(false);
    const [changeSummary, setChangeSummary] = useState('');
    const [currentVersion, setCurrentVersion] = useState<number>(1);
    const [saveFormat, setSaveFormat] = useState<'docx' | 'pdf'>('docx');
    const [downloadFormat, setDownloadFormat] = useState<'docx' | 'pdf'>('docx');
    const [convertedFromPdf, setConvertedFromPdf] = useState(false);
    const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const editorInstance = useEditorStore((state: any) => state.editor);
    const { toast } = useToast();
    const editorReadySentRef = useRef<boolean>(false);
    const documentLoadedRef = useRef<string | null>(null);

    // Load the document on mount - only once per documentId
    useEffect(() => {
        // Check URL params for converted PDF flag FIRST
        const urlParams = new URLSearchParams(window.location.search);
        const isConvertedFromPdf = urlParams.get('convertedFromPdf') === 'true';
        
        if (isConvertedFromPdf) {
            setConvertedFromPdf(true);
            setSaveFormat('pdf'); // Default to save as PDF for converted documents
            setDownloadFormat('pdf');
            setIsWaitingForConversion(true); // Show waiting state
            setIsLoading(true); // Keep loading state
            setError(null); // Clear any error
            // Don't auto-load document - wait for converted DOCX from parent
            console.log('Document is converted from PDF, waiting for LOAD_DOCUMENT message');
        } else if (documentId && documentLoadedRef.current !== documentId) {
            // Only auto-load if NOT converted from PDF
            documentLoadedRef.current = documentId;
            loadDocumentById(documentId);
        }

        // Listen for messages from parent (for converted PDFs and other cases)
        const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const { type, data } = event.data;
            if (type === 'LOAD_DOCUMENT' && data.wordUrl) {
                console.log('Received LOAD_DOCUMENT with wordUrl:', data.wordUrl);
                setIsWaitingForConversion(false); // Stop waiting
                // Track if this was converted from PDF
                if (data.convertedFromPdf) {
                    setConvertedFromPdf(true);
                    setSaveFormat('pdf'); // Default to save as PDF
                    setDownloadFormat('pdf');
                    setOriginalPdfUrl(data.originalPdfUrl || null);
                }
                // Mark as loaded to prevent duplicate loads
                documentLoadedRef.current = data.id || documentId || 'loaded';
                loadWordDocumentFromUrl(data.wordUrl);
            }
        };

        window.addEventListener('message', handleMessage);

        // Notify parent that Word editor is ready - only once
        if (!editorReadySentRef.current) {
            editorReadySentRef.current = true;
            console.log('WordEditor mounted, sending EDITOR_READY');
            if (window.opener) {
                window.opener.postMessage({ type: 'EDITOR_READY' }, window.location.origin);
            } else if (window.parent !== window) {
                window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
            }
        }

        return () => window.removeEventListener('message', handleMessage);
    }, [documentId]);

    // Render DOCX preview when in preview mode and we have the buffer
    useEffect(() => {
        if (mode === 'preview' && docxArrayBuffer && containerRef.current) {
            renderDocxPreview();
        }
    }, [mode, docxArrayBuffer]);

    const loadDocumentById = async (docId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            // Get document info from database
            const { data: doc, error: docError } = await supabase
                .from('documents')
                .select('storage_path, file_name, file_size')
                .eq('id', docId)
                .single();

            if (docError || !doc?.storage_path) {
                throw new Error('Document not found');
            }

            // Get latest version number
            const { data: versionData, error: versionError } = await supabase
                .from('document_versions')
                .select('version_number')
                .eq('document_id', docId)
                .order('version_number', { ascending: false })
                .limit(1)
                .single();
            
            if (versionData?.version_number) {
                setCurrentVersion(versionData.version_number);
            } else if (!versionError || versionError.code === 'PGRST116') {
                // No versions exist - create initial version v1
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { error: createVersionError } = await supabase
                        .from('document_versions')
                        .insert({
                            document_id: docId,
                            version_number: 1,
                            content: doc.storage_path, // Store storage path for initial version
                            created_by: user.id,
                            change_summary: 'Initial upload'
                        });
                    
                    if (!createVersionError) {
                        setCurrentVersion(1);
                    }
                }
            }

            // Get signed URL for the file
            const { data: urlData, error: urlError } = await supabase.storage
                .from('documents')
                .createSignedUrl(doc.storage_path, 3600);

            if (urlError || !urlData?.signedUrl) {
                throw new Error('Failed to get document URL');
            }

            await loadWordDocumentFromUrl(urlData.signedUrl);
        } catch (error: any) {
            console.error('Error loading document:', error);
            setError(error.message || 'Failed to load document');
            setIsLoading(false);
        }
    };

    const loadWordDocumentFromUrl = async (url: string) => {
        setIsLoading(true);
        setError(null);
        try {
            console.log('Fetching Word document from:', url);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            setDocxArrayBuffer(arrayBuffer);

            toast({
                title: "Document loaded",
                description: "Word document loaded successfully",
            });
        } catch (error: any) {
            console.error('Error loading Word document:', error);
            setError(error.message || 'Failed to load Word document');
        } finally {
            setIsLoading(false);
        }
    };

    const renderDocxPreview = async () => {
        if (!containerRef.current || !docxArrayBuffer) return;

        try {
            // Clear previous content
            containerRef.current.innerHTML = '';

            // Render DOCX directly using docx-preview
            await renderAsync(docxArrayBuffer, containerRef.current, undefined, {
                className: 'docx-preview',
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
                ignoreFonts: false,
                breakPages: true,
                ignoreLastRenderedPageBreak: true,
                experimental: true,
                trimXmlDeclaration: true,
                useBase64URL: true,
                renderHeaders: true,
                renderFooters: true,
                renderFootnotes: true,
                renderEndnotes: true,
            });

            console.log('DOCX preview rendered successfully');
        } catch (err) {
            console.error('Error rendering DOCX preview:', err);
            // Don't set error state for rendering issues - document is still loaded
            // User can try switching to edit mode if preview doesn't work
        }
    };

    const switchToEditMode = async () => {
        // Prevent multiple calls
        if (!docxArrayBuffer || isLoading || mode === 'edit') return;

        setIsLoading(true);
        try {
            // Convert to HTML for editing using mammoth
            const result = await mammoth.convertToHtml({ arrayBuffer: docxArrayBuffer }, {
                convertImage: mammoth.images.inline(function(element: any) {
                    return element.read("base64").then(function(imageBuffer: string) {
                        return { src: `data:${element.contentType};base64,${imageBuffer}` };
                    });
                })
            });

            // Store the HTML content - it will be passed to the Editor component
            setEditHtmlContent(result.value);
            setMode('edit');
            
            toast({
                title: "Edit mode",
                description: "You can now edit the document.",
            });
        } catch (error: any) {
            console.error('Error converting to edit mode:', error);
            toast({
                title: "Error",
                description: "Failed to convert document for editing",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const switchToPreviewMode = async () => {
        if (!editorInstance) {
            setMode('preview');
            return;
        }

        setIsLoading(true);
        try {
            // Get the current HTML content from the editor
            const htmlContent = editorInstance.getHTML();
            
            // Export to DOCX blob to get the updated preview
            const docxBlob = await exportDocument({
                metadata: {
                    title: documentName || 'Document',
                    author: 'User',
                    lastUpdated: new Date(),
                    headerContent: '',
                    footerContent: ''
                },
                content: htmlContent,
                format: 'docx',
                returnBlob: true
            }) as Blob;

            // Convert blob to ArrayBuffer for preview
            const arrayBuffer = await docxBlob.arrayBuffer();
            setDocxArrayBuffer(arrayBuffer);
            
            // Update the edit HTML content as well
            setEditHtmlContent(htmlContent);
            
            setMode('preview');
            
            toast({
                title: "Preview updated",
                description: "Showing your edited document",
            });
        } catch (error: any) {
            console.error('Error switching to preview mode:', error);
            // Fallback: just switch to preview mode with original content
            setMode('preview');
            toast({
                title: "Preview",
                description: "Showing original document (edit changes will be saved when you click Save)",
                variant: "default"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = () => {
        if (!editorInstance) {
            toast({
                title: "Error",
                description: "Editor not ready. Please wait a moment and try again.",
                variant: "destructive"
            });
            return;
        }
        setShowSaveDialog(true);
    };

    const saveWithVersion = async () => {
        if (!editorInstance) {
            toast({
                title: "Editor not available",
                description: "Cannot save - editor instance not found",
                variant: "destructive"
            });
            return;
        }
        
        if (!documentId) {
            toast({
                title: "Document ID missing",
                description: "Cannot save - document ID not found",
                variant: "destructive"
            });
            return;
        }
        
        setIsSaving(true);
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                throw new Error('You must be logged in to save');
            }

            const htmlContent = editorInstance.getHTML();
            const textContent = editorInstance.getText();
            const newVersion = currentVersion + 1;

            // Export to DOCX blob first
            const docxBlob = await exportDocument({
                metadata: {
                    title: documentName || 'Document',
                    author: user.email || 'User',
                    lastUpdated: new Date(),
                    headerContent: '',
                    footerContent: ''
                },
                content: htmlContent,
                format: 'docx',
                returnBlob: true
            }) as Blob;

            // Determine final blob and content type based on save format
            let finalBlob: Blob = docxBlob;
            let contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            let fileExtension = '.docx';

            // If saving as PDF (for converted PDF documents)
            if (convertedFromPdf && saveFormat === 'pdf') {
                toast({
                    title: "Converting to PDF",
                    description: "Please wait while we convert your document...",
                });

                // Convert DOCX to PDF via backend
                const formData = new FormData();
                formData.append('file', docxBlob, 'document.docx');

                const response = await fetch(`${BACKEND_URL}/api/editor/docx-to-pdf`, {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error('Failed to convert to PDF');
                }

                finalBlob = await response.blob();
                contentType = 'application/pdf';
                fileExtension = '.pdf';
            }

            // Get original document storage path
            const { data: doc } = await supabase
                .from('documents')
                .select('storage_path, file_name')
                .eq('id', documentId)
                .single();

            if (!doc?.storage_path) {
                throw new Error('Document not found');
            }

            // Determine version path - keep original extension or use new one
            const basePath = doc.storage_path.replace(/\.[^.]+$/, '');
            const versionPath = `${basePath}_v${newVersion}${fileExtension}`;
            
            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(versionPath, finalBlob, {
                    upsert: true,
                    contentType: contentType
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                // Continue anyway - we'll still save the version record
            }

            // Create version record with storage path reference
            const { data: versionData, error: versionError } = await supabase
                .from('document_versions')
                .insert({
                    document_id: documentId,
                    version_number: newVersion,
                    content: versionPath, // Store the storage path so we can fetch the file later
                    created_by: user.id,
                    change_summary: changeSummary || `Version ${newVersion} saved as ${saveFormat.toUpperCase()}`
                })
                .select();

            if (versionError) {
                console.error('Version error details:', versionError);
                throw new Error(`Failed to create version: ${versionError.message || versionError.code || 'Unknown error'}`);
            }

            // Also update the main document file with the latest version
            const mainPath = doc.storage_path.replace(/\.[^.]+$/, '') + fileExtension;
            const { error: mainUploadError } = await supabase.storage
                .from('documents')
                .upload(mainPath, finalBlob, {
                    upsert: true,
                    contentType: contentType
                });

            if (mainUploadError) {
                console.error('Main upload error:', mainUploadError);
            }

            // Update document's updated_at timestamp and file type if changed
            const updateData: any = { updated_at: new Date().toISOString() };
            if (convertedFromPdf && saveFormat === 'docx') {
                // Update file type if saving PDF as DOCX
                updateData.file_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                updateData.file_name = doc.file_name.replace('.pdf', '.docx');
            }
            
            await supabase
                .from('documents')
                .update(updateData)
                .eq('id', documentId);

            setCurrentVersion(newVersion);
            setShowSaveDialog(false);
            setChangeSummary('');

            toast({
                title: "Document saved",
                description: `Version ${newVersion} saved as ${convertedFromPdf ? saveFormat.toUpperCase() : 'DOCX'}`,
            });

            // Notify parent window
            const message = {
                type: 'DOCUMENT_SAVED',
                data: {
                    documentId,
                    version: newVersion,
                    html: htmlContent,
                    text: textContent
                }
            };

            if (window.opener) {
                window.opener.postMessage(message, window.location.origin);
            } else if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            }

        } catch (error: any) {
            console.error('Save error:', error);
            toast({
                title: "Save failed",
                description: error.message || "Failed to save document",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownload = async () => {
        // Show download dialog with format options
        setShowDownloadDialog(true);
    };

    const downloadWithFormat = async (format: 'docx' | 'pdf') => {
        setShowDownloadDialog(false);
        
        if (mode === 'preview' && docxArrayBuffer) {
            if (format === 'docx') {
                // Download original DOCX
                const blob = new Blob([docxArrayBuffer], { 
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
                });
                const url = URL.createObjectURL(blob);
                const a = globalThis.document.createElement('a');
                a.href = url;
                a.download = (documentName || 'document').replace('.pdf', '') + '.docx';
                a.click();
                URL.revokeObjectURL(url);
            } else {
                // Convert to PDF
                await convertAndDownloadPdf(docxArrayBuffer);
            }
            return;
        }

        if (!editorInstance) return;

        try {
            // Export to DOCX first
            const docxBlob = await exportDocument({
                metadata: {
                    title: documentName || 'Document',
                    author: 'User',
                    lastUpdated: new Date(),
                    headerContent: '',
                    footerContent: ''
                },
                content: editorInstance.getHTML(),
                format: 'docx',
                returnBlob: true
            }) as Blob;

            if (format === 'docx') {
                // Download as DOCX
                const url = URL.createObjectURL(docxBlob);
                const a = globalThis.document.createElement('a');
                a.href = url;
                a.download = (documentName || 'document').replace('.pdf', '') + '.docx';
                a.click();
                URL.revokeObjectURL(url);
                
                toast({
                    title: "Download started",
                    description: "Your document is being exported to DOCX",
                });
            } else {
                // Convert DOCX to PDF
                const arrayBuffer = await docxBlob.arrayBuffer();
                await convertAndDownloadPdf(arrayBuffer);
            }
        } catch (error) {
            console.error('Download error:', error);
            toast({
                title: "Download failed",
                description: "Could not export document",
                variant: "destructive"
            });
        }
    };

    const convertAndDownloadPdf = async (docxData: ArrayBuffer) => {
        try {
            toast({
                title: "Converting to PDF",
                description: "Please wait while we convert your document...",
            });

            const formData = new FormData();
            const blob = new Blob([docxData], { 
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
            });
            formData.append('file', blob, (documentName || 'document').replace('.pdf', '') + '.docx');

            const response = await fetch(`${BACKEND_URL}/api/editor/docx-to-pdf`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('PDF conversion failed');
            }

            const pdfBlob = await response.blob();
            const url = URL.createObjectURL(pdfBlob);
            const a = globalThis.document.createElement('a');
            a.href = url;
            a.download = (documentName || 'document').replace('.docx', '') + '.pdf';
            a.click();
            URL.revokeObjectURL(url);

            toast({
                title: "Download complete",
                description: "Your document has been downloaded as PDF",
            });
        } catch (error) {
            console.error('PDF conversion error:', error);
            toast({
                title: "PDF conversion failed",
                description: "Could not convert document to PDF. Try downloading as DOCX instead.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Word-like Header */}
            <div className="bg-[#2b579a] text-white px-4 py-2 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6" />
                    <span className="font-semibold truncate max-w-md">
                        {documentName || 'Word Document'}
                    </span>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                        {mode === 'preview' ? 'Preview' : 'Editing'}
                    </span>
                    <span className="text-xs bg-green-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                        <History className="h-3 w-3" />
                        v{currentVersion}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {mode === 'preview' ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-[#1e3e6d]"
                            onClick={switchToEditMode}
                        >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-[#1e3e6d]"
                                onClick={switchToPreviewMode}
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-[#1e3e6d]"
                                onClick={handleSave}
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Save
                            </Button>
                        </>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-[#1e3e6d]"
                        onClick={handleDownload}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                    </Button>
                </div>
            </div>

            {/* Editor/Preview Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {mode === 'edit' && <Toolbar />}
                <div className="flex-1 overflow-auto p-8 flex justify-center bg-[#f3f2f1]">
                    <div className="w-[816px] min-h-[1056px] bg-white shadow-xl relative">
                        {isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
                                <Loader2 className="h-12 w-12 animate-spin text-[#2b579a] mb-4" />
                                {isWaitingForConversion ? (
                                    <>
                                        <p className="text-gray-600 font-medium">Converting PDF to Word...</p>
                                        <p className="text-gray-500 text-sm mt-2">This may take a few minutes for large documents</p>
                                    </>
                                ) : (
                                    <p className="text-gray-600 font-medium">Opening Word document...</p>
                                )}
                            </div>
                        ) : error ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                                    <h3 className="text-red-800 font-bold text-lg mb-2">Failed to load document</h3>
                                    <p className="text-red-600 mb-4">{error}</p>
                                    <Button variant="outline" onClick={() => documentId && loadDocumentById(documentId)}>
                                        Retry
                                    </Button>
                                </div>
                            </div>
                        ) : mode === 'preview' ? (
                            <div 
                                ref={containerRef} 
                                className="docx-container w-full min-h-full"
                                style={{ padding: '0' }}
                            />
                        ) : (
                            <Editor initialContent={editHtmlContent || ''} embedded={true} />
                        )}
                    </div>
                </div>
            </div>

            {/* CSS for docx-preview */}
            <style>{`
                .docx-container .docx-wrapper {
                    background: white;
                    padding: 96px;
                }
                .docx-container .docx-wrapper > section.docx {
                    box-shadow: none;
                    margin-bottom: 0;
                }
            `}</style>

            {/* Save Version Dialog */}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Save className="h-5 w-5" />
                            Save Document Version
                        </DialogTitle>
                        <DialogDescription>
                            Save your changes as a new version (v{currentVersion + 1}). 
                            {convertedFromPdf && (
                                <span className="block mt-1 text-amber-600">
                                    This document was converted from PDF. Choose format below.
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {convertedFromPdf && (
                            <div className="grid gap-2">
                                <Label>Save Format</Label>
                                <RadioGroup 
                                    value={saveFormat} 
                                    onValueChange={(val) => setSaveFormat(val as 'docx' | 'pdf')}
                                    className="gap-2"
                                >
                                    <div className="flex items-center space-x-3 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                                        <RadioGroupItem value="pdf" id="save-pdf" />
                                        <Label htmlFor="save-pdf" className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-red-600" />
                                                <span className="font-medium">PDF (.pdf)</span>
                                                <span className="text-xs text-muted-foreground">- Original format</span>
                                            </div>
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-3 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                                        <RadioGroupItem value="docx" id="save-docx" />
                                        <Label htmlFor="save-docx" className="flex-1 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-blue-600" />
                                                <span className="font-medium">Word (.docx)</span>
                                                <span className="text-xs text-muted-foreground">- Editable</span>
                                            </div>
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        )}
                        <div className="grid gap-2">
                            <Label htmlFor="change-summary">Change Summary (optional)</Label>
                            <Textarea
                                id="change-summary"
                                placeholder="Describe what you changed..."
                                value={changeSummary}
                                onChange={(e) => setChangeSummary(e.target.value)}
                                rows={3}
                            />
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                            <p className="font-medium">Version Control Info</p>
                            <p className="text-xs mt-1">
                                Current version: v{currentVersion}<br />
                                New version will be: v{currentVersion + 1}
                                {convertedFromPdf && <><br />Save format: {saveFormat.toUpperCase()}</>}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveWithVersion} disabled={isSaving}>
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save as {convertedFromPdf ? saveFormat.toUpperCase() : 'DOCX'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Download Format Dialog */}
            <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileDown className="h-5 w-5" />
                            Download Document
                        </DialogTitle>
                        <DialogDescription>
                            Choose the format to download your document.
                            {convertedFromPdf && (
                                <span className="block mt-2 text-amber-600">
                                    This document was converted from PDF. You can save it back as PDF or keep it as DOCX.
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <RadioGroup 
                            value={downloadFormat} 
                            onValueChange={(val) => setDownloadFormat(val as 'docx' | 'pdf')}
                            className="gap-3"
                        >
                            <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="docx" id="download-docx" />
                                <Label htmlFor="download-docx" className="flex-1 cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-blue-600" />
                                        <div>
                                            <div className="font-medium">Word Document (.docx)</div>
                                            <div className="text-xs text-muted-foreground">Editable in Microsoft Word, Google Docs</div>
                                        </div>
                                    </div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="pdf" id="download-pdf" />
                                <Label htmlFor="download-pdf" className="flex-1 cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-red-600" />
                                        <div>
                                            <div className="font-medium">PDF Document (.pdf)</div>
                                            <div className="text-xs text-muted-foreground">Best for sharing and printing</div>
                                        </div>
                                    </div>
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => downloadWithFormat(downloadFormat)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download as {downloadFormat.toUpperCase()}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
