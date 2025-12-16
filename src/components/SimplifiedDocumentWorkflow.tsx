import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useDocumentProcessingContext } from "@/contexts/DocumentProcessingContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Database, CheckCircle, AlertCircle, Loader2, Camera, Search, Edit, Clock, X } from 'lucide-react';
import { DocumentUploadArea } from '@/components/document/DocumentUploadArea';
import { TemplateDetection } from '@/components/TemplateDetection';
import { ManualTemplateSelector } from '@/components/ManualTemplateSelector';
import { CameraCapture } from '@/components/CameraCapture';
import PreviewImagesButton from '@/components/PreviewImagesButton';
import { useToast } from "@/hooks/use-toast";
import { DocumentAnalysisService } from "@/services/documentAnalysis";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentData as WorkflowDocumentData, FormField } from '@/types/workflow';
import type { DocumentData as UploadDocumentData, TemplateMatch } from '@/types/document';
import type { EnhancedTemplateMatch } from '@/services/enhancedTemplateMatching';
import { countFieldsFromHierarchicalData } from '@/utils/templateDataOrganizer';

interface SimplifiedDocumentWorkflowProps {
  onComplete?: (result: { documentData: WorkflowDocumentData; savedToDatabase: boolean }) => void;
}

type WorkflowStep = 'upload' | 'template-selection' | 'manual-selection' | 'extraction' | 'completed';

export const SimplifiedDocumentWorkflow: React.FC<SimplifiedDocumentWorkflowProps> = ({ onComplete }) => {
  // Access processing context to reset any template-matching state when entering Step 2
  const { 
    resetTemplateMatching, 
    setIsTemplateMatching, 
    setTemplateMatchingProgress, 
    setTemplateMatches,
    currentWorkflowStep: currentStep,
    setCurrentWorkflowStep: setCurrentStep,
    workflowDocumentData: documentData,
    setWorkflowDocumentData: setDocumentData,
    extractedData: globalExtractedData,
    setExtractedData: setGlobalExtractedData,
    isEditingData,
    setIsEditingData,
    editedData,
    triggerRefresh
  } = useDocumentProcessingContext();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMatch | EnhancedTemplateMatch | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [detectionCompleted, setDetectionCompleted] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [isDataSaved, setIsDataSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [convertedImages, setConvertedImages] = useState<string[]>([]);
  const [extractionTime, setExtractionTime] = useState<number | null>(null); // Stored in milliseconds
  const [extractionStartTime, setExtractionStartTime] = useState<number | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('general'); // Document type for special processing
  const { toast } = useToast();

  // Document type options for special processing
  const documentTypeOptions = [
    { value: 'general', label: 'General Document' },
    { value: 'bank_statement', label: 'Bank Statement' },
    { value: 'invoice', label: 'Invoice' },
    { value: 'identity_document', label: 'Identity Document' },
  ];

  // Storage key for processing state persistence
  const PROCESSING_STATE_KEY = 'docuform.processingState';

  // Restore processing state from localStorage on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(PROCESSING_STATE_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        
        // Only restore if processing was in progress
        if (state.isProcessing && state.currentStep === 'extraction') {
          // Restore processing state
          setIsProcessing(true);
          setProgress(state.progress || 0);
          
          // Restore extraction timing
          if (state.extractionStartTime) {
            const startTime = state.extractionStartTime;
            setExtractionStartTime(startTime);
            // Calculate elapsed time
            const elapsed = Date.now() - startTime;
            setExtractionTime(elapsed);
          }
          
          // Restore request ID for cancellation
          if (state.currentRequestId) {
            setCurrentRequestId(state.currentRequestId);
          }
          
          // Restore workflow step
          if (state.currentStep) {
            setCurrentStep(state.currentStep);
          }
          
          // Restore selected template if available
          if (state.selectedTemplate) {
            setSelectedTemplate(state.selectedTemplate);
          }
          
          console.log('✅ Restored processing state from localStorage');
        } else {
          // Clear stale processing state
          localStorage.removeItem(PROCESSING_STATE_KEY);
        }
      }
    } catch (e) {
      console.warn('[SimplifiedDocumentWorkflow] Failed to restore processing state:', e);
      localStorage.removeItem(PROCESSING_STATE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Persist processing state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (isProcessing && currentStep === 'extraction') {
        // Save processing state
        const state = {
          isProcessing: true,
          progress,
          extractionStartTime,
          currentStep,
          currentRequestId,
          selectedTemplate: selectedTemplate ? {
            id: (selectedTemplate as any).id,
            name: (selectedTemplate as any).name,
            confidence: (selectedTemplate as any).confidence
          } : null
        };
        localStorage.setItem(PROCESSING_STATE_KEY, JSON.stringify(state));
      } else {
        // Clear processing state when not processing
        localStorage.removeItem(PROCESSING_STATE_KEY);
      }
    } catch (e) {
      console.warn('[SimplifiedDocumentWorkflow] Failed to persist processing state:', e);
    }
  }, [isProcessing, progress, extractionStartTime, currentStep, currentRequestId, selectedTemplate]);

  // Helper function to format milliseconds to readable string
  const formatExtractionTime = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      const seconds = Math.floor(ms / 1000);
      const milliseconds = ms % 1000;
      if (milliseconds === 0) {
        return `${seconds}s`;
      }
      return `${seconds}.${String(milliseconds).padStart(3, '0')}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const milliseconds = ms % 1000;
      if (milliseconds === 0) {
        return `${minutes}m ${seconds}s`;
      }
      return `${minutes}m ${seconds}.${String(milliseconds).padStart(3, '0')}s`;
    }
  };

  // Update elapsed time during processing
  useEffect(() => {
    if (!isProcessing || !extractionStartTime) {
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - extractionStartTime; // Keep in milliseconds
      setExtractionTime(elapsed);
    }, 100); // Update every 100ms for smoother display

    return () => clearInterval(interval);
  }, [isProcessing, extractionStartTime]);

  const steps = [
    { key: 'upload', title: 'Upload Document', icon: Upload, completed: !['upload'].includes(currentStep) },
    { key: 'template-selection', title: 'Select Template', icon: FileText, completed: ['extraction', 'completed'].includes(currentStep) },
    { key: 'extraction', title: 'Extract & Save', icon: Database, completed: currentStep === 'completed' }
  ];

  // Load extracted data when component mounts and workflow is completed
  // This ensures persistence across navigation
  useEffect(() => {
    if (globalExtractedData) {
      console.log('Loading extracted data from global state:', globalExtractedData);
      
      // If we have extracted data, processing must be complete
      // Clear any processing state
      if (isProcessing) {
        setIsProcessing(false);
        localStorage.removeItem(PROCESSING_STATE_KEY);
      }
      
      // Restore converted images if available and not already set
      if (globalExtractedData.convertedImages && 
          globalExtractedData.convertedImages.length > 0 && 
          convertedImages.length === 0) {
        setConvertedImages(globalExtractedData.convertedImages);
      }
      
      // Restore extraction time if available and not already set
      // Check if extractionTime is stored in milliseconds (new format) or seconds (legacy format)
      if (globalExtractedData.extractionTime !== undefined && 
          globalExtractedData.extractionTime !== null && 
          extractionTime === null) {
        // If extractionTime > 100000, it's likely in milliseconds (e.g., 13567ms)
        // If extractionTime < 1000, it's likely in seconds (e.g., 13s)
        // For backward compatibility, check both formats
        const timeValue = globalExtractedData.extractionTime;
        if (timeValue > 100000 || (timeValue > 1000 && timeValue < 60000)) {
          // Already in milliseconds (new format) or large value
          setExtractionTime(timeValue);
        } else {
          // Legacy format: stored in seconds, convert to milliseconds
          setExtractionTime(timeValue * 1000);
        }
      }
      
      // Restore document data if not already set
      if (!documentData) {
        setDocumentData(globalExtractedData);
      }
      
      // Restore workflow step if we have extracted data
      if (currentStep !== 'completed' && globalExtractedData.hierarchicalData) {
        setCurrentStep('completed');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalExtractedData]); // Only depend on globalExtractedData to avoid loops

  // Convert upload document data to workflow document data
  const convertToWorkflowDocumentData = (uploadDoc: UploadDocumentData, file?: File): WorkflowDocumentData => {
    return {
      id: uploadDoc.id,
      filename: uploadDoc.name,
      originalFile: file || new File([''], uploadDoc.name),
      preprocessedImage: uploadDoc.base64Data,
      extractedFields: [],
      confidence: 0
    };
  };

  // Step 1: Handle document upload/scan
  const handleDocumentUploaded = (uploadDocument: UploadDocumentData) => {
    console.log('Document uploaded:', uploadDocument);
    const workflowDocument = convertToWorkflowDocumentData(uploadDocument);
    setDocumentData(workflowDocument);
    // Ensure no auto template detection carries over from prior sessions
    try {
      setIsTemplateMatching(false);
      setTemplateMatchingProgress(0);
      setTemplateMatches([]);
      resetTemplateMatching();
    } catch (_e) {
      // non-fatal safeguard
    }
    setCurrentStep('template-selection');
    
    toast({
      title: "Document uploaded successfully",
      description: `${uploadDocument.name} is ready for processing`,
    });
  };

  // Step 2: Handle template selection (auto or manual)
  const handleTemplateSelected = (template: TemplateMatch | EnhancedTemplateMatch) => {
    console.log('Template selected:', template);
    setSelectedTemplate(template);
    setShowManualSelection(false);
    proceedToExtraction(template);
  };

  const handleManualTemplateSelection = () => {
    console.log('Opening manual template selection');
    setCurrentStep('manual-selection');
    setShowManualSelection(true);
  };

  const handleDetectionComplete = (hasMatches: boolean) => {
    setDetectionCompleted(true);
    setDetectionFailed(!hasMatches);
  };

  const handleProcessWithoutTemplate = () => {
    console.log('Processing without template');
    setSelectedTemplate(null);
    setShowManualSelection(false);
    proceedToExtraction(null);
  };

  // Cancel processing
  const handleCancelProcessing = async () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    
    if (currentRequestId) {
      try {
        const analysisService = DocumentAnalysisService.getInstance();
        await analysisService.cancelRequest(currentRequestId);
      } catch (error) {
        console.error('Error cancelling request:', error);
      }
      setCurrentRequestId(null);
    }
    
    setIsProcessing(false);
    setProgress(0);
    setExtractionTime(null);
    setExtractionStartTime(null);
    
    // Clear processing state from localStorage
    localStorage.removeItem(PROCESSING_STATE_KEY);
    
    toast({
      title: "Processing cancelled",
      description: "Document processing has been cancelled",
      variant: "destructive"
    });
  };

  // Step 3: Extract information and save to database
  const proceedToExtraction = async (template: TemplateMatch | EnhancedTemplateMatch | null) => {
    if (!documentData) return;

    setCurrentStep('extraction');
    setIsProcessing(true);
    setProgress(0);
    setExtractionTime(null); // Reset extraction time

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    // Record start time for real-time updates
    const startTime = Date.now();
    setExtractionStartTime(startTime);

    try {
      // Extract information using AI
      const analysisService = DocumentAnalysisService.getInstance();
      
      // Get maxWorkers, maxThreads, yoloSignatureEnabled, and yoloFaceEnabled from user preferences (stored in localStorage)
      const storedPreferences = localStorage.getItem('user_preferences');
      let maxWorkers = 10; // Default
      let maxThreads = 10; // Default
      let yoloSignatureEnabled = true; // Default
      let yoloFaceEnabled = true; // Default
      if (storedPreferences) {
        try {
          const prefs = JSON.parse(storedPreferences);
          maxWorkers = prefs.pdfProcessingMaxWorkers || 10;
          maxThreads = prefs.pdfProcessingMaxThreads || 10;
          yoloSignatureEnabled = prefs.yoloSignatureEnabled !== undefined ? prefs.yoloSignatureEnabled : true;
          yoloFaceEnabled = prefs.yoloFaceEnabled !== undefined ? prefs.yoloFaceEnabled : true;
        } catch (e) {
          console.warn('Failed to parse user preferences:', e);
        }
      }
      
      setProgress(30);
      toast({
        title: "Extracting information",
        description: template ? `Using ${template.name} template` : "Using comprehensive extraction without template",
      });

      // If a template is selected, do template-guided extraction for highest accuracy
      let fieldResult: any = { fields: [] };
      let ocrResult: any = { extractedText: '' };
      let extractedImages: string[] = [];
      let templateResult: any = null;
      let genericResult: any = null;

      const docPayload = documentData.preprocessedImage || '';

      if (template) {
        setProgress(45);
        // Always fetch full template (including metadata) from DB for template-guided extraction
        // Metadata is required for proper template structure organization
        let enhancedTemplates: any[] | undefined = undefined;
        try {
          // Always fetch from Supabase to ensure we have metadata
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { supabase } = await import('@/integrations/supabase/client');
          console.log('🔍 [Frontend] Fetching template with metadata from DB, template ID:', (template as any).id);
          
          const { data, error } = await supabase
            .from('document_templates')
            .select('id, name, document_type, version, fields, metadata')
            .eq('id', (template as any).id)
            .single();
            
          if (!error && data) {
            const hasMetadata = data.metadata !== null && data.metadata !== undefined;
            const hasTemplateStructure = hasMetadata && data.metadata?.template_structure;
            console.log('✅ [Frontend] Template fetched from DB:', {
              id: data.id,
              name: data.name,
              hasMetadata,
              hasTemplateStructure,
              metadataKeys: hasMetadata ? Object.keys(data.metadata) : []
            });
            enhancedTemplates = [data];
          } else {
            // Fallback: use provided template if DB fetch fails
            console.warn('⚠️ [Frontend] Failed to fetch template from DB, using provided template:', error);
            enhancedTemplates = [template];
          }
        } catch (e) {
          console.warn('⚠️ [Frontend] Error loading template from DB, using provided template:', e);
          enhancedTemplates = [template];
        }
        
        console.log('📤 [Frontend] Sending templates to backend:', enhancedTemplates?.map(t => ({
          id: t.id,
          name: t.name,
          hasMetadata: !!(t.metadata),
          hasTemplateStructure: !!(t.metadata?.template_structure)
        })));

        templateResult = await analysisService.analyzeDocument(
          docPayload,
          'template_guided_extraction' as any,
          documentData.filename,
          enhancedTemplates,
          false, // Don't save to database automatically
          maxWorkers,
          maxThreads,
          yoloSignatureEnabled,
          yoloFaceEnabled,
          controller.signal,
          selectedDocumentType // Pass document type for special processing (e.g., bank_statement)
        );
        if (templateResult.requestId) {
          setCurrentRequestId(templateResult.requestId);
        }
        fieldResult = templateResult.result;
      } else {
        // Generic flow using without_template_extraction for comprehensive data extraction
        setProgress(50);
        genericResult = await analysisService.analyzeDocument(
          docPayload,
          'without_template_extraction' as any,
          documentData.filename,
          undefined,
          false, // Don't save to database automatically
          maxWorkers,
          maxThreads,
          yoloSignatureEnabled,
          yoloFaceEnabled,
          controller.signal,
          selectedDocumentType // Pass document type for special processing (e.g., bank_statement)
        );
        if (genericResult.requestId) {
          setCurrentRequestId(genericResult.requestId);
        }
        fieldResult = genericResult.result;
        ocrResult = { extractedText: '' }; // No OCR text needed
      }

      // Store the converted images from the response
      console.log('🔍 Template result convertedImages:', templateResult?.convertedImages);
      console.log('🔍 Generic result convertedImages:', genericResult?.convertedImages);
      
      const resultImages = templateResult?.convertedImages || genericResult?.convertedImages || [];
      if (resultImages && Array.isArray(resultImages)) {
        extractedImages = resultImages;
        setConvertedImages(extractedImages);
        console.log('✅ Stored converted images:', extractedImages.length);
      } else {
        console.log('❌ No converted images found in response');
      }

      setProgress(80);

      // Get hierarchical_data directly from LLM response (no fields array conversion)
      const hierarchicalData = genericResult?.result?.hierarchical_data || 
                              templateResult?.result?.hierarchical_data ||
                              fieldResult?.hierarchical_data ||
                              null;

      // Final extraction time is already set by the interval, but ensure it's accurate
      const endTime = Date.now();
      const duration = endTime - startTime; // Duration in milliseconds
      setExtractionTime(duration);
      setExtractionStartTime(null); // Stop the interval

      const extractedData: WorkflowDocumentData = {
        ...documentData,
        convertedImages: extractedImages, // Store the exact images sent to LLM
        extractionTime: duration, // Store extraction time in milliseconds to preserve precision
        ocrText: ocrResult.extractedText || '',
        extractedFields: [], // Empty array - system now uses hierarchicalData only
        templateMatch: template || undefined,
        confidence: template 
          ? Math.max((template.confidence || 0) / 100, 0.8) 
          : 0.7,
        hierarchicalData: hierarchicalData // Primary data source - no fields array needed
      };

      // Store extracted data globally (includes convertedImages and extractionTime)
      setGlobalExtractedData(extractedData);
      
      // Extract document ID from backend auto-save response
      const backendResponse = templateResult || genericResult;
      if (backendResponse?.savedDocument?.id) {
        console.log('🔑 Setting savedDocumentId from backend auto-save:', backendResponse.savedDocument.id);
        setSavedDocumentId(backendResponse.savedDocument.id);
      } else {
        console.log('⚠️ No savedDocument.id found in backend response');
      }
      
      setProgress(100);
      setCurrentStep('completed');

      // Check for warnings (failed pages)
      const warnings = genericResult?.warnings || templateResult?.warnings || [];
      if (warnings.length > 0) {
        const failedPages = warnings.map((w: any) => `Page ${w.page_num}`).join(", ");
        toast({
          title: "Processing completed with warnings",
          description: `Some pages failed after retry: ${failedPages}. Check the results for details.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Processing completed",
          description: `Document processed and ${(() => {
          // Count only the actual field-value pairs displayed to user
          const countFields = (data: any): number => {
            if (Array.isArray(data)) {
              // For arrays, count items in the array (like qualification rows)
              return data.reduce((total, item) => {
                if (typeof item === 'object' && item !== null) {
                  // Count the key-value pairs within each array item
                  return total + Object.keys(item).length;
                }
                return total + 1;
              }, 0);
            } else if (typeof data === 'object' && data !== null) {
              // For objects, count only leaf-level field-value pairs
              return Object.values(data).reduce((total, value) => {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                  // For nested objects, count their key-value pairs
                  return total + Object.keys(value).length;
                } else if (Array.isArray(value)) {
                  // For arrays, count items in the array
                  return total + value.reduce((arrayTotal, item) => {
                    if (typeof item === 'object' && item !== null) {
                      return arrayTotal + Object.keys(item).length;
                    }
                    return arrayTotal + 1;
                  }, 0);
                }
                return total + 1;
              }, 0);
            }
            return 1;
          };

          if (Array.isArray(fieldResult.fields)) {
            return countFields(fieldResult.fields);
          } else if (typeof fieldResult.fields === 'object' && fieldResult.fields !== null) {
            return countFields(fieldResult.fields);
          }
          return 0;
        })()} fields extracted`,
        });
      }

      onComplete?.({
        documentData: extractedData,
        savedToDatabase: true
      });

    } catch (error) {
      console.error('Extraction failed:', error);
      setExtractionStartTime(null); // Stop the interval on error
      
      // Check if error is due to cancellation
      if (error instanceof Error && (error.message.includes('cancelled') || error.name === 'AbortError')) {
        // Already handled by handleCancelProcessing
        return;
      }
      
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to extract information",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setAbortController(null);
      setCurrentRequestId(null);
      // Clear processing state from localStorage when done
      localStorage.removeItem(PROCESSING_STATE_KEY);
    }
  };

  // Save document and extracted data to Supabase and localStorage
  const saveToDatabase = async (data: WorkflowDocumentData): Promise<void> => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      // Fall back to localStorage if not authenticated
      const savedDocuments = JSON.parse(localStorage.getItem('processed_documents') || '[]');
      savedDocuments.push({
        id: data.id,
        filename: data.filename,
        extractedFields: data.extractedFields,
        templateUsed: data.templateMatch?.name,
        confidence: data.confidence,
        processedAt: new Date().toISOString(),
        ocrText: data.ocrText
      });
      localStorage.setItem('processed_documents', JSON.stringify(savedDocuments));
      return;
    }

    try {
      console.log('🔄 Starting auto-save to database...');
      // Save to existing documents table with correct column names
      const { data: documentRecord, error: documentError } = await supabase
        .from('documents')
        .insert({
          user_id: user.user.id,
          file_name: data.filename,
          storage_path: `documents/${user.user.id}/${data.filename}`,
          file_type: data.originalFile?.type || 'application/pdf',
          file_size: data.originalFile?.size || 0,
          extracted_text: data.ocrText || '',
          processing_status: 'completed',
          analysis_result: {
            extractedFields: data.extractedFields || [],
            templateUsed: data.templateMatch?.name,
            confidence: data.confidence || 0,
            processedAt: new Date().toISOString(),
            hierarchicalData: data.hierarchicalData || null
          }
        })
        .select()
        .single();
      
      console.log('📊 Supabase insert response - documentRecord:', documentRecord);
      console.log('📊 Supabase insert response - documentError:', documentError);

      if (documentError) {
        console.error('Document insert error:', documentError);
        throw new Error(`Failed to save document: ${documentError.message}`);
      }

      console.log('Document saved successfully with ID:', documentRecord.id);
      // Store the document ID immediately after successful save
      console.log('🔑 Setting savedDocumentId to:', documentRecord.id);
      setSavedDocumentId(documentRecord.id);

      // Generate embeddings for RAG
      if (data.ocrText && data.ocrText.trim().length > 0) {
        try {
          console.log('Generating embeddings for document:', documentRecord.id);
          const { data: embeddingResult, error: embeddingError } = await supabase.functions.invoke('generate-embeddings', {
            body: { 
              text: data.ocrText,
              documentId: documentRecord.id 
            }
          });
          
          if (embeddingError) {
            console.error('Embedding generation failed:', embeddingError);
          } else {
      console.log('Embeddings generated successfully for document:', documentRecord.id);
          }
        } catch (embeddingError) {
          console.error('Error generating embeddings:', embeddingError);
        }
      }

      // Also save to localStorage for immediate access
      const savedDocuments = JSON.parse(localStorage.getItem('processed_documents') || '[]');
      savedDocuments.push({
        id: data.id,
        filename: data.filename,
        extractedFields: data.extractedFields,
        templateUsed: data.templateMatch?.name,
        confidence: data.confidence,
        processedAt: new Date().toISOString(),
        ocrText: data.ocrText,
        supabaseId: documentRecord.id
      });
      localStorage.setItem('processed_documents', JSON.stringify(savedDocuments));
      
      // Store the document ID for later use
      setSavedDocumentId(documentRecord.id);

    } catch (error) {
      console.error('Database save error:', error);
      // Fall back to localStorage on error
      const savedDocuments = JSON.parse(localStorage.getItem('processed_documents') || '[]');
      savedDocuments.push({
        id: data.id,
        filename: data.filename,
        extractedFields: data.extractedFields,
        templateUsed: data.templateMatch?.name,
        confidence: data.confidence,
        processedAt: new Date().toISOString(),
        ocrText: data.ocrText,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      localStorage.setItem('processed_documents', JSON.stringify(savedDocuments));
    }
  };

  // Helper function to merge edited data with original data structure
  const mergeEditedData = (originalData: any, editedData: any): any => {
    if (!originalData || !editedData) return originalData;
    
    // Deep clone the original data
    const mergedData = JSON.parse(JSON.stringify(originalData));
    
    console.log('🔍 Merging data - originalData structure:', Object.keys(originalData));
    console.log('🔍 Merging data - editedData:', editedData);
    console.log('🔍 Merging data - has hierarchical_data:', !!originalData.hierarchical_data);
    
    // PRIMARY: Handle hierarchical_data structure (main data storage format)
    if (mergedData.hierarchical_data && typeof mergedData.hierarchical_data === 'object') {
      console.log('� Merging into hierarchical_data...');
      
      Object.keys(editedData).forEach(sectionKey => {
        const sectionEdits = editedData[sectionKey];
        if (!sectionEdits || typeof sectionEdits !== 'object') return;
        
        // Find the matching section in hierarchical_data (case-insensitive)
        const matchingSectionKey = Object.keys(mergedData.hierarchical_data).find(key => {
          if (key.startsWith('_')) return false; // Skip internal keys
          const normalizedKey = key.toLowerCase().replace(/[\s_-]+/g, '_');
          return normalizedKey === sectionKey || key.toLowerCase() === sectionKey.toLowerCase();
        });
        
        if (matchingSectionKey && mergedData.hierarchical_data[matchingSectionKey]) {
          const sectionData = mergedData.hierarchical_data[matchingSectionKey];
          
          // Handle object sections (most common case)
          if (typeof sectionData === 'object' && !Array.isArray(sectionData)) {
            Object.keys(sectionEdits).forEach(fieldKey => {
              // Find matching field key (case-insensitive)
              const matchingFieldKey = Object.keys(sectionData).find(key => {
                const normalizedKey = key.toLowerCase().replace(/[\s_-]+/g, '_');
                return normalizedKey === fieldKey.toLowerCase().replace(/[\s_-]+/g, '_') ||
                       key.toLowerCase() === fieldKey.toLowerCase();
              });
              
              if (matchingFieldKey !== undefined) {
                console.log(`� Updating hierarchical_data.${matchingSectionKey}.${matchingFieldKey}: "${sectionData[matchingFieldKey]}" → "${sectionEdits[fieldKey]}"`);
                sectionData[matchingFieldKey] = sectionEdits[fieldKey];
              } else {
                // Add new field if it doesn't exist
                console.log(`➕ Adding new field hierarchical_data.${matchingSectionKey}.${fieldKey}: "${sectionEdits[fieldKey]}"`);
                sectionData[fieldKey] = sectionEdits[fieldKey];
              }
            });
          }
          // Handle primitive values
          else if (typeof sectionData !== 'object') {
            // If section is a primitive, check if we have a direct value edit
            const directValue = sectionEdits[sectionKey] || sectionEdits['value'];
            if (directValue !== undefined) {
              console.log(`🔄 Updating hierarchical_data.${matchingSectionKey}: "${sectionData}" → "${directValue}"`);
              mergedData.hierarchical_data[matchingSectionKey] = directValue;
            }
          }
        } else {
          console.log(`⚠️ Section not found in hierarchical_data: ${sectionKey}`);
        }
      });
    }
    
    // FALLBACK: Handle fields array structure (legacy format)
    if (mergedData.fields && Array.isArray(mergedData.fields)) {
      console.log('🔄 Merging into fields array...');
      mergedData.fields.forEach((field: any) => {
        const fieldLabel = field.label || field.name;
        if (!fieldLabel) return;
        
        const sectionKey = fieldLabel.toLowerCase().replace(/\s+/g, '_');
        const sectionEdits = editedData[sectionKey];
        
        if (sectionEdits && field.value && typeof field.value === 'object') {
          Object.keys(field.value).forEach(fieldName => {
            const matchingKey = Object.keys(sectionEdits).find(key => 
              key.toLowerCase() === fieldName.toLowerCase()
            );
            
            if (matchingKey && sectionEdits[matchingKey] !== undefined) {
              console.log(`🔄 Updating fields.${sectionKey}.${fieldName}: "${field.value[fieldName]}" → "${sectionEdits[matchingKey]}"`);
              field.value[fieldName] = sectionEdits[matchingKey];
            }
          });
        }
      });
    }
    
    // FALLBACK: Handle _parsed object structure (legacy format)
    if (mergedData._parsed && typeof mergedData._parsed === 'object') {
      console.log('🔄 Merging into _parsed...');
      Object.keys(mergedData._parsed).forEach(sectionKey => {
        if (!sectionKey) return;
        const normalizedSectionKey = sectionKey.toLowerCase().replace(/\s+/g, '_');
        const sectionEdits = editedData[normalizedSectionKey];
        
        if (sectionEdits && mergedData._parsed[sectionKey] && typeof mergedData._parsed[sectionKey] === 'object') {
          Object.keys(mergedData._parsed[sectionKey]).forEach(fieldName => {
            if (sectionEdits[fieldName] !== undefined) {
              console.log(`🔄 Updating _parsed.${sectionKey}.${fieldName}: "${mergedData._parsed[sectionKey][fieldName]}" → "${sectionEdits[fieldName]}"`);
              mergedData._parsed[sectionKey][fieldName] = sectionEdits[fieldName];
            }
          });
        }
      });
    }
    
    console.log('✅ Merged data result:', mergedData);
    return mergedData;
  };


  const handleSaveToDatabase = async () => {
    console.log('🚀 Starting save to database...');
    console.log('📊 documentData:', documentData);
    console.log('📊 globalExtractedData:', globalExtractedData);
    console.log('📊 editedData:', editedData);
    
    if (!documentData) {
      console.log('❌ No documentData, returning');
      return;
    }
    
    setIsSaving(true);
    try {
      const analysisService = DocumentAnalysisService.getInstance();
      
      // Get the current extracted data
      let currentData = globalExtractedData || documentData;
      console.log('📊 currentData before merge:', currentData);
      console.log('📊 currentData.hierarchicalData:', currentData?.hierarchicalData);
      console.log('📊 currentData.hierarchical_data:', currentData?.hierarchical_data);
      
      // Build analysisResult with proper hierarchical_data structure
      let analysisResult: any = {};
      
      // Get hierarchical_data from various possible locations
      const hierarchicalData = currentData?.hierarchicalData || 
                              currentData?.hierarchical_data || 
                              currentData?.analysis_result?.hierarchical_data ||
                              null;
      
      if (hierarchicalData) {
        analysisResult.hierarchical_data = hierarchicalData;
        console.log('📊 Found hierarchical_data:', Object.keys(hierarchicalData));
      }
      
      // Include other structures if they exist
      if (currentData?.extractedFields) {
        analysisResult.fields = currentData.extractedFields;
      } else if (currentData?.fields) {
        analysisResult.fields = currentData.fields;
      }
      
      if (currentData?._parsed) {
        analysisResult._parsed = currentData._parsed;
      }
      
      // Merge edited data if it exists
      if (editedData && Object.keys(editedData).length > 0) {
        console.log('🔄 Merging edited data...');
        console.log('📊 editedData keys:', Object.keys(editedData));
        analysisResult = mergeEditedData(analysisResult, editedData);
        console.log('📊 analysisResult after merge:', analysisResult);
      }
      
      if (!analysisResult || Object.keys(analysisResult).length === 0) {
        throw new Error('No extracted data to save');
      }
      
      // Determine the task type based on whether template was used
      const task = selectedTemplate ? 'template_guided_extraction' : 'without_template_extraction';
      console.log('📊 task:', task);
      console.log('📊 selectedTemplate:', selectedTemplate);
      
      // Get user ID from auth
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'default-user';
      console.log('📊 userId:', userId);
      console.log('📊 savedDocumentId (for update):', savedDocumentId);
      
      console.log('🔄 Calling directSaveToDatabase...');
      
      // Call direct save instead of re-processing
      const saveResult = await analysisService.directSaveToDatabase(
        analysisResult,
        task,
        userId,
        currentData.filename,
        savedDocumentId || undefined
      );
      
      console.log('📊 saveResult:', saveResult);
      console.log('📊 saveResult.success:', saveResult.success);
      console.log('📊 saveResult.documentId:', saveResult.documentId);
      
      if (saveResult.success) {
        console.log('✅ Setting isDataSaved to true');
        setIsDataSaved(true);
        setSavedDocumentId(saveResult.documentId || 'saved');
        
        // Trigger refresh of document history
        triggerRefresh();
        
        toast({
          title: "✅ Data Saved Successfully!",
          description: "Your document has been saved to the database",
          duration: 5000,
        });
      } else {
        console.log('❌ Save failed - no success flag');
        throw new Error('Failed to save document - no success response');
      }
    } catch (error) {
      console.error('Save to database error:', error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : 'Failed to save document',
        variant: "destructive",
      });
    } finally {
      console.log('🏁 Setting isSaving to false');
      setIsSaving(false);
    }
  };

  const resetWorkflow = () => {
    setCurrentStep('upload');
    setDocumentData(null);
    setSelectedTemplate(null);
    setIsProcessing(false);
    setProgress(0);
    setShowManualSelection(false);
    setDetectionCompleted(false);
    setDetectionFailed(false);
    setConvertedImages([]); // Clear converted images
    setIsDataSaved(false);
    setIsSaving(false);
    setSavedDocumentId(null);
    setExtractionTime(null);
    setExtractionStartTime(null);
    setAbortController(null);
    setCurrentRequestId(null);
    // Clear processing state from localStorage
    localStorage.removeItem(PROCESSING_STATE_KEY);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 pb-8 w-full">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Document Processing
            </CardTitle>
            <Button variant="outline" size="sm" onClick={resetWorkflow}>
              Start Over
            </Button>
          </div>
          <Progress value={(steps.findIndex(s => s.completed === false) / steps.length) * 100} className="w-full" />
        </CardHeader>
      </Card>

      {/* Steps Overview */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((step, index) => (
              <div key={step.key} className="flex flex-col items-center text-center">
                <div className={`p-3 rounded-full border-2 mb-2 ${
                  step.completed ? 'border-success bg-success/10' :
                  currentStep === step.key ? 'border-primary bg-primary/10' :
                  'border-border bg-background'
                }`}>
                  {step.completed ? (
                    <CheckCircle className="w-5 h-5 text-success" />
                  ) : (
                    <step.icon className={`w-5 h-5 ${currentStep === step.key ? 'text-primary' : 'text-muted-foreground'}`} />
                  )}
                </div>
                <p className="font-medium text-sm">{step.title}</p>
                <Badge variant={step.completed ? 'default' : currentStep === step.key ? 'default' : 'secondary'}>
                  {step.completed ? 'Complete' : currentStep === step.key ? 'Active' : 'Pending'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Upload Document */}
      {currentStep === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Upload or Scan Document</CardTitle>
            <p className="text-muted-foreground">
              Upload a document from your device or use your camera to scan one
            </p>
          </CardHeader>
          <CardContent>
            <DocumentUploadArea
              onFileUploaded={handleDocumentUploaded}
              onCameraClick={() => setShowCamera(true)}
            />
            
            {showCamera && (
              <CameraCapture
                onCapture={(file) => {
                  setShowCamera(false);
                  // Convert file to UploadDocumentData format first
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const uploadDocumentData: UploadDocumentData = {
                      id: `doc_${Date.now()}`,
                      name: file.name,
                      type: file.type,
                      size: file.size,
                      base64Data: e.target?.result as string,
                      uploadedAt: new Date()
                    };
                    handleDocumentUploaded(uploadDocumentData);
                  };
                  reader.readAsDataURL(file);
                }}
                onClose={() => setShowCamera(false)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Template Selection */}
      {currentStep === 'template-selection' && documentData && !showManualSelection && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Select Template</CardTitle>
            <p className="text-muted-foreground">
              Choose how you'd like to process your document
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Document Type Selector for special processing */}
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Document Type</label>
                <p className="text-xs text-muted-foreground">
                  Select document type for optimized extraction (e.g., Bank Statement for multi-page table headers)
                </p>
              </div>
              <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <TemplateDetection
              documentName={documentData.filename}
              documentData={documentData.preprocessedImage}
              onTemplateSelected={handleTemplateSelected}
              onCreateNew={() => handleProcessWithoutTemplate()}
            />
            
            {/* Simplified Options */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                onClick={handleManualTemplateSelection}
                className="flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                Browse Templates
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleProcessWithoutTemplate}
                className="flex items-center justify-center gap-2"
              >
                <Database className="w-4 h-4" />
                Process Without Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2b: Manual Template Selection */}
      {(currentStep === 'manual-selection' || showManualSelection) && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Manual Template Selection</CardTitle>
            <p className="text-muted-foreground">
              Browse available templates and select the one that best matches your document
            </p>
          </CardHeader>
          <CardContent>
            <ManualTemplateSelector
              onTemplateSelected={handleTemplateSelected}
              onCancel={() => {
                setShowManualSelection(false);
                setCurrentStep('template-selection');
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 3: Extraction & Saving */}
      {currentStep === 'extraction' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Extracting Information</CardTitle>
            <p className="text-muted-foreground">
              {selectedTemplate 
                ? `Extracting data using ${selectedTemplate.name} template`
                : 'Extracting data using AI analysis'
              }
            </p>
          </CardHeader>
          <CardContent className="text-center">
            {isProcessing ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <div className="space-y-2">
                  <Progress value={progress} className="w-full max-w-md mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    {progress < 50 ? 'Analyzing document structure...' :
                     progress < 80 ? 'Extracting field information...' :
                     'Saving to repository...'}
                  </p>
                  {extractionTime !== null && (
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      Elapsed: {formatExtractionTime(extractionTime)}
                    </p>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancelProcessing}
                    className="mt-4"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel Processing
                  </Button>
                </div>
                {selectedTemplate && (
                  <div className="p-3 bg-primary/5 rounded-lg max-w-md mx-auto">
                    <p className="text-sm text-primary">
                      Using template: {selectedTemplate.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round((selectedTemplate.confidence || 0) <= 1 
                        ? (selectedTemplate.confidence || 0) * 100 
                        : selectedTemplate.confidence || 0)}% match confidence
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Completed */}
      {currentStep === 'completed' && (globalExtractedData || documentData) && (
        <Card className="border-success">
          <CardHeader>
            <CardTitle className="text-success flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Processing Complete!
            </CardTitle>
            <p className="text-muted-foreground">
              {isDataSaved 
                ? "✅ Your document has been processed and saved successfully to the database!"
                : "Your document has been processed successfully. Click \"Save to Database\" to persist the data."
              }
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Document Details</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Filename:</span> {(globalExtractedData || documentData)?.filename}</p>
                  <p><span className="text-muted-foreground">Template:</span> {selectedTemplate?.name || 'Generic extraction'}</p>
                  <p><span className="text-muted-foreground">Fields extracted:</span> {(() => {
                    const data = globalExtractedData || documentData;
                    
                    // Count from extracted hierarchical data (works for both template-based and without-template extraction)
                    const hierarchicalData = data?.hierarchicalData || data?.hierarchical_data;
                    if (hierarchicalData && typeof hierarchicalData === 'object' && !Array.isArray(hierarchicalData)) {
                      return countFieldsFromHierarchicalData(hierarchicalData);
                    }
                    
                    // Fallback: try extractedFields array (for legacy non-template extraction)
                    if (data?.extractedFields && Array.isArray(data.extractedFields) && data.extractedFields.length > 0) {
                      return data.extractedFields.length;
                    }
                    
                    return 0;
                  })()}</p>
                  {extractionTime !== null && (
                    <p className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Extraction time:</span> 
                      <span className="font-medium">
                        {formatExtractionTime(extractionTime)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Next Steps</h4>
                <div className="space-y-2">
                    {console.log('🔍 Rendering buttons - isDataSaved:', isDataSaved, 'isSaving:', isSaving)}
                    {!isDataSaved ? (
                      <Button
                        size="sm" 
                        className="w-full bg-primary"
                        onClick={handleSaveToDatabase}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Database className="w-4 h-4 mr-2" />
                            Save to Database
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          size="sm" 
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          disabled
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Data Saved Successfully
                        </Button>
                        <p className="text-xs text-green-600 text-center">
                          ✓ Document saved to database
                        </p>
                      </div>
                    )}
                    {!isEditingData ? (
                      <Button
                        size="sm" 
                        className="w-full"
                        onClick={() => {
                          setIsEditingData(true);
                          setIsDataSaved(false); // Reset save status when editing starts
                        }}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Data
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          size="sm" 
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setIsEditingData(false)}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Done Editing
                        </Button>
                        <p className="text-xs text-green-600 text-center">
                          ✓ Data editing mode active
                        </p>
                      </div>
                    )}
                    <PreviewImagesButton
                      documentData={(globalExtractedData || documentData)?.preprocessedImage || ''}
                      convertedImages={convertedImages}
                      size="sm"
                      className="w-full"
                    />
                  <Button variant="outline" size="sm" className="w-full" onClick={resetWorkflow}>
                    Process Another Document
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};