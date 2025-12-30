import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from 'pdfjs-dist';

// Debug: log pdf.js version in dev
console.debug('[PDFJS] Loaded version:', (pdfjsLib as any).version);

// Helper: timeout wrapper to avoid silent stalls
const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]) as T;
};

export interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  duration?: number;
  startTime?: number;
}

export interface ProcessedDocument {
  id: string;
  filename: string;
  storageUrl: string;
  extractedFields: any[];
  confidence: number;
  template?: any;
}

export const useDocumentProcessing = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProcessingStep | null>(null);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [processedDocument, setProcessedDocument] = useState<ProcessedDocument | null>(null);

  const uploadFile = async (file: File, userId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(fileName, file);

    if (error) throw error;

    return data.path;
  };

  const analyzeDocument = async (documentData: string, task: 'ocr' | 'field_detection' | 'template_matching', documentName?: string) => {
    console.debug('[Analyze] Using REAL AI processing for', task);
    console.debug('[Analyze] Document data length:', documentData.length);
    console.debug('[Analyze] Document name:', documentName);

    try {
      // Get current user for database saving
      const { data: { user } } = await supabase.auth.getUser();
      console.debug('[Analyze] User ID:', user?.id);

      const fastApiUrl = (import.meta as any).env.VITE_FASTAPI_URL;
      if (!fastApiUrl) throw new Error('VITE_FASTAPI_URL is required');
      console.debug('[Analyze] Calling FastAPI backend...', fastApiUrl);
      const resp = await fetch(`${fastApiUrl}/api/v1/analyze-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentData,
          task,
          documentName: documentName || 'unknown',
          userId: user?.id || null,
          saveToDatabase: true
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({} as any));
        console.error('FastAPI error:', err);
        throw new Error(err?.detail || `AI analysis failed: HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (!data.success) {
        console.error('AI analysis failed:', data.error);
        throw new Error(`AI analysis failed: ${data.error}`);
      }

      console.debug('[Analyze] AI response:', data.result);
      return data.result;
    } catch (error) {
      console.error('Document analysis error:', error);
      throw error;
    }
  };

  const processDocument = async (file: File) => {
    setIsProcessing(true);
    setProcessedDocument(null);

    const initialSteps: ProcessingStep[] = [
      {
        id: 'upload',
        title: 'Uploading Document',
        description: 'Securely uploading your document to the cloud',
        status: 'pending',
        progress: 0
      },
      {
        id: 'ocr',
        title: 'OCR Processing',
        description: 'Extracting text and structure from the document',
        status: 'pending',
        progress: 0
      },
      {
        id: 'field_detection',
        title: 'Field Detection',
        description: 'AI-powered identification of form fields and data',
        status: 'pending',
        progress: 0
      },
      {
        id: 'template_matching',
        title: 'Template Analysis',
        description: 'Finding matching templates and generating form structure',
        status: 'pending',
        progress: 0
      },
      {
        id: 'database',
        title: 'Saving Results',
        description: 'Storing processed data and creating workflow',
        status: 'pending',
        progress: 0
      }
    ];

    setSteps(initialSteps);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Step 1: Upload file
      setCurrentStep(initialSteps[0]);
      setSteps(prev => prev.map(s =>
        s.id === 'upload'
          ? { ...s, status: 'processing', startTime: Date.now() }
          : s
      ));

      // Simulate upload progress
      for (let i = 0; i <= 100; i += 20) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setSteps(prev => prev.map(s =>
          s.id === 'upload' ? { ...s, progress: i } : s
        ));
      }

      const storagePath = await uploadFile(file, user.id);

      setSteps(prev => prev.map(s =>
        s.id === 'upload'
          ? { ...s, status: 'completed', progress: 100, duration: Date.now() - (s.startTime || 0) }
          : s
      ));

      // Convert file to base64 for AI processing (images and PDFs)
      const getImageBase64 = (file: File): Promise<string> =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1600;
              const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl);
              } else {
                resolve(reader.result as string);
              }
            };
            img.src = reader.result as string;
          };
          reader.readAsDataURL(file);
        });

      // Upload a preview image to storage and return a signed URL
      const uploadPreviewImage = async (dataUrl: string, userId: string): Promise<{ path: string; signedUrl: string }> => {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const path = `${userId}/previews/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage
          .from('documents')
          .createSignedUrl(path, 60 * 60);
        if (signErr || !signed?.signedUrl) throw signErr || new Error('Failed to create signed URL');
        return { path, signedUrl: signed.signedUrl };
      };

      // Ensure PDF.js is available (run without worker to avoid stalls)
      const ensurePdfJs = async (): Promise<any> => {
        const lib: any = pdfjsLib as any;
        if (!lib || typeof lib.getDocument !== 'function') {
          throw new Error('PDF.js library not available');
        }
        // Disable worker usage to avoid cross-origin/worker bundling issues
        lib.GlobalWorkerOptions.workerSrc = undefined as any;
        return lib;
      };

      const getPDFFirstPageAsImage = async (file: File): Promise<string> => {
        console.debug('[PDFJS] Converting PDF first page to image...');
        try {
          const lib = await withTimeout(ensurePdfJs(), 15000, 'PDF.js load');
          const arrayBuffer = await withTimeout(file.arrayBuffer(), 12000, 'PDF read');
          const loadingTask = lib.getDocument({ data: arrayBuffer, worker: null });
          const pdf = await withTimeout(loadingTask.promise as Promise<any>, 20000, 'PDF open') as any;

          const page = await withTimeout(pdf.getPage(1) as Promise<any>, 12000, 'PDF getPage') as any;
          const viewport = (page as any).getViewport({ scale: 1.4 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D context not available');

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          console.debug('[PDFJS] Rendering page to canvas', { width: canvas.width, height: canvas.height });
          await withTimeout((page as any).render({ canvasContext: context, viewport }).promise as Promise<any>, 25000, 'PDF render');
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          console.debug('[PDFJS] Conversion complete, dataUrl size:', dataUrl.length);
          return dataUrl;
        } catch (err) {
          console.error('[PDFJS] PDF conversion failed', err);
          throw new Error('PDF OCR preparation failed. Please try another PDF or image.');
        }
      };

      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';

      // Step 2: OCR Processing
      setCurrentStep(initialSteps[1]);
      setSteps(prev => prev.map(s =>
        s.id === 'ocr'
          ? { ...s, status: 'processing', startTime: Date.now() }
          : s
      ));

      // Get document data for AI analysis
      let documentDataForAI = '';
      if (isImage) {
        documentDataForAI = await getImageBase64(file);
      } else if (isPDF) {
        documentDataForAI = await getPDFFirstPageAsImage(file);
      }

      const ocrResult = await analyzeDocument(documentDataForAI, 'ocr', file.name);

      setSteps(prev => prev.map(s =>
        s.id === 'ocr'
          ? { ...s, status: 'completed', progress: 100, duration: Date.now() - (s.startTime || 0) }
          : s
      ));

      // OCR processing complete
      console.log('OCR Result received:', ocrResult);

      // Step 3: Field Detection
      setCurrentStep(initialSteps[2]);
      setSteps(prev => prev.map(s =>
        s.id === 'field_detection'
          ? { ...s, status: 'processing', startTime: Date.now() }
          : s
      ));

      const fieldResult = await analyzeDocument(documentDataForAI, 'field_detection', file.name);

      setSteps(prev => prev.map(s =>
        s.id === 'field_detection'
          ? { ...s, status: 'completed', progress: 100, duration: Date.now() - (s.startTime || 0) }
          : s
      ));

      // Field detection complete
      console.log('Field Detection Result:', fieldResult);

      // Step 4: Template Matching
      setCurrentStep(initialSteps[3]);
      setSteps(prev => prev.map(s =>
        s.id === 'template_matching'
          ? { ...s, status: 'processing', startTime: Date.now() }
          : s
      ));

      const templateResult = await analyzeDocument(documentDataForAI, 'template_matching', file.name);

      setSteps(prev => prev.map(s =>
        s.id === 'template_matching'
          ? { ...s, status: 'completed', progress: 100, duration: Date.now() - (s.startTime || 0) }
          : s
      ));

      // Template matching complete
      console.log('Template Matching Result:', templateResult);

      // Step 5: Save to database
      setCurrentStep(initialSteps[4]);
      setSteps(prev => prev.map(s =>
        s.id === 'database'
          ? { ...s, status: 'processing', startTime: Date.now() }
          : s
      ));

      // Combine all results
      const processedData = {
        ocr: ocrResult,
        fields: fieldResult,
        templates: templateResult
      };

      const confidence = fieldResult?.confidence || 0;

      // Extract full text from OCR results for database storage
      const extractedText = ocrResult?.extractedText || '';

      // Prepare comprehensive document metadata
      const documentMetadata = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
        uploadDate: new Date().toISOString(),
        dimensions: ocrResult?.dimensions,
        pages: ocrResult?.pages || 1,
        language: ocrResult?.language || 'en'
      };

      // Prepare processing metadata
      const processingMetadata = {
        processingSteps: steps.map(step => ({
          id: step.id,
          title: step.title,
          duration: step.duration,
          status: step.status
        })),
        totalProcessingTime: steps.reduce((total, step) => total + (step.duration || 0), 0),
        aiModel: 'gpt-4o-mini',
        processingDate: new Date().toISOString(),
        extractedFields: fieldResult?.fields?.length || 0
      };

      // Get storage URL for uploaded file
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      // Save document to database (using existing documents table structure)
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
          file_type: file.type,
          original_url: urlData.publicUrl,
          extracted_text: extractedText,
          confidence_score: confidence,
          processing_status: 'completed',
          metadata: {
            document: documentMetadata,
            processing: processingMetadata,
            results: processedData
          }
        })
        .select()
        .single();

      if (docError) throw docError;

      // Create Version 1 record in document_versions for version comparison feature
      try {
        const { error: versionError } = await supabase
          .from('document_versions')
          .insert({
            document_id: docData.id,
            version_number: 1,
            content: storagePath,  // Store the storage path to the original file
            change_summary: 'Initial upload',
            created_by: user.id,
            major_version: 1,
            minor_version: 0,
          });

        if (versionError) {
          console.warn('Could not create initial version record:', versionError);
        } else {
          console.log('Created version 1 record for document:', docData.id);
        }
      } catch (versionCreationError) {
        // Log but don't fail - the main document save was successful
        console.warn('Error creating version record:', versionCreationError);
      }


      // Generate embeddings for RAG after document is saved
      try {
        const { data: embeddingResult } = await supabase.functions.invoke('generate-embeddings', {
          body: {
            text: extractedText,
            documentId: docData.id
          }
        });

        if (embeddingResult?.error) {
          console.error('Embedding generation failed:', embeddingResult.error);
        } else {
          console.log('Embeddings generated successfully');
        }
      } catch (embeddingError) {
        console.error('Error generating embeddings:', embeddingError);
      }

      // Note: Skipping document_fields table as it's not in current schema
      // Field data is stored in the document metadata instead

      setSteps(prev => prev.map(s =>
        s.id === 'database'
          ? { ...s, status: 'completed', progress: 100, duration: Date.now() - (s.startTime || 0) }
          : s
      ));

      setProcessedDocument({
        id: docData.id,
        filename: file.name,
        storageUrl: urlData.publicUrl,
        extractedFields: fieldResult?.fields || [],
        confidence: confidence,
        template: templateResult?.bestMatch
      });

      // Document processing complete
      console.log('Document processed successfully');

    } catch (error) {
      console.error('Document processing error:', error);

      setSteps(prev => prev.map(s =>
        s.status === 'processing'
          ? { ...s, status: 'error', progress: 0 }
          : s
      ));

      console.error('Processing failed:', error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
      setCurrentStep(null);
    }
  };

  const resetProcessing = () => {
    setSteps([]);
    setCurrentStep(null);
    setProcessedDocument(null);
    setIsProcessing(false);
  };

  return {
    processDocument,
    resetProcessing,
    isProcessing,
    currentStep,
    steps,
    processedDocument
  };
};