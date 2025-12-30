import React, { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import {
  GitCompare,
  FileText,
  Search,
  Plus,
  ArrowRight,
  Sparkles,
  History,
  ChevronRight,
  FolderOpen,
  Loader2,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useDocumentVersions } from '@/hooks/useDocumentVersions';
import { DocumentComparisonDialog } from './DocumentComparisonDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { VersionComparison } from '@/types/versionControl';

interface ComparisonDashboardProps {
  documents?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    created_at: string;
    updated_at: string;
  }>;
}

interface ComparisonHistory {
  id: string;
  documentName: string;
  baseVersion: string;
  compareVersion: string;
  timestamp: string;
  changesCount: number;
  type: 'version' | 'document' | 'ai';
  // Additional data for replaying comparisons
  documentId?: string;
  baseVersionId?: string;
  compareVersionId?: string;
  doc1Id?: string;
  doc2Id?: string;
  comparisonData?: VersionComparison;
  aiAnalysisText?: string; // Store the AI analysis text
}

type ComparisonMode = 'versions' | 'documents' | 'ai';

export function ComparisonDashboard({ documents = [] }: ComparisonDashboardProps) {
  const { user } = useAuth();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedBaseVersion, setSelectedBaseVersion] = useState<string | null>(null);
  const [selectedCompareVersion, setSelectedCompareVersion] = useState<string | null>(null);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('versions');

  // For document-to-document comparison
  const [selectedDoc1, setSelectedDoc1] = useState<string | null>(null);
  const [selectedDoc2, setSelectedDoc2] = useState<string | null>(null);
  const [isComparingDocs, setIsComparingDocs] = useState(false);

  // For AI Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [showAiResultDialog, setShowAiResultDialog] = useState(false);

  // Helper function for safe date formatting
  const formatSafeDate = (dateString: string | null | undefined, formatStr: string = 'MMM d, HH:mm'): string => {
    if (!dateString) return 'Invalid date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      return format(date, formatStr);
    } catch {
      return 'Invalid date';
    }
  };

  // Comparison history from database
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load comparison history from database (with localStorage fallback)
  React.useEffect(() => {
    const loadHistory = async () => {
      if (!user?.id) return;
      
      setIsLoadingHistory(true);
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${BACKEND_URL}/api/ai/history/${user.id}?limit=50`);
        
        if (response.ok) {
          const data = await response.json();
          
          // If we have data from database, use it
          if (data && data.length > 0) {
            // Transform backend data to match ComparisonHistory interface
            const transformed = data.map((item: any) => ({
              id: item.id,
              documentName: item.document_name,
              baseVersion: item.base_version,
              compareVersion: item.compare_version,
              timestamp: item.created_at,
              changesCount: item.changes_count,
              type: item.comparison_type,
              documentId: item.document_id,
              baseVersionId: item.base_version_id,
              compareVersionId: item.compare_version_id,
              doc1Id: item.doc1_id,
              doc2Id: item.doc2_id,
              comparisonData: item.comparison_data,
              aiAnalysisText: item.ai_analysis_text,
            }));
            setComparisonHistory(transformed);
            return;
          }
        }
        
        // Fallback to localStorage if no database data
        const saved = localStorage.getItem('comparison_history');
        if (saved) {
          const localHistory = JSON.parse(saved);
          setComparisonHistory(localHistory);
          console.log('Loaded history from localStorage (database was empty)');
        }
      } catch (error) {
        console.error('Failed to load comparison history from database:', error);
        // Fallback to localStorage on error
        try {
          const saved = localStorage.getItem('comparison_history');
          if (saved) {
            const localHistory = JSON.parse(saved);
            setComparisonHistory(localHistory);
            console.log('Loaded history from localStorage (fallback)');
          }
        } catch {
          console.error('Failed to load from localStorage as well');
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [user?.id]);

  const { versions, compareVersions, isLoading } = useDocumentVersions({
    documentId: selectedDocumentId || '',
    autoRefresh: false,
  });

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    return documents.filter(doc =>
      doc.file_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  const saveToHistory = useCallback(async (item: Omit<ComparisonHistory, 'id' | 'timestamp'>, comparisonResult?: VersionComparison) => {
    if (!user?.id) return;

    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/ai/save-comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          document_id: item.documentId,
          document_name: item.documentName,
          comparison_type: item.type,
          base_version: item.baseVersion,
          compare_version: item.compareVersion,
          changes_count: item.changesCount,
          base_version_id: item.baseVersionId,
          compare_version_id: item.compareVersionId,
          doc1_id: item.doc1Id,
          doc2_id: item.doc2Id,
          comparison_data: comparisonResult,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Add to local state immediately
        const newItem: ComparisonHistory = {
          ...item,
          id: result.id,
          timestamp: new Date().toISOString(),
          comparisonData: comparisonResult,
        };
        setComparisonHistory(prev => [newItem, ...prev]);
      }
    } catch (error) {
      console.error('Failed to save comparison to history:', error);
      toast.error('Failed to save comparison to history');
    }
  }, [user?.id]);

  // Handler to replay a comparison from history
  const handleReplayComparison = useCallback(async (historyItem: ComparisonHistory) => {
    try {
      // For AI analysis type, show the saved AI analysis
      if (historyItem.type === 'ai') {
        if (historyItem.aiAnalysisText) {
          setAiAnalysisResult(historyItem.aiAnalysisText);
          setShowAiResultDialog(true);
          toast.success('AI analysis loaded from history');
          return;
        } else if (user && historyItem.baseVersionId && historyItem.compareVersionId) {
          // Try to fetch from backend
          const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
          const cachedResponse = await fetch(
            `${BACKEND_URL}/api/ai/comparison?user_id=${user.id}&base_version_id=${historyItem.baseVersionId}&compare_version_id=${historyItem.compareVersionId}`
          );
          
          if (cachedResponse.ok) {
            const cachedData = await cachedResponse.json();
            if (cachedData && cachedData.analysis_text) {
              setAiAnalysisResult(cachedData.analysis_text);
              setShowAiResultDialog(true);
              toast.success('AI analysis loaded from database');
              return;
            }
          }
        }
      }
      
      // If we have cached comparison data, use it directly
      if (historyItem.comparisonData) {
        setComparison(historyItem.comparisonData);
        setShowComparisonDialog(true);
        return;
      }

      // For version comparisons, re-run the comparison
      if (historyItem.type === 'version' && historyItem.baseVersionId && historyItem.compareVersionId && historyItem.documentId) {
        // Set the document to load its versions
        setSelectedDocumentId(historyItem.documentId);
        setSelectedBaseVersion(historyItem.baseVersionId);
        setSelectedCompareVersion(historyItem.compareVersionId);
        toast.info('Loading comparison data...');
        // The actual re-comparison will happen when the user clicks Compare again
        // or we could trigger it automatically after versions are loaded
        return;
      }

      // For document comparisons without cached data
      if (historyItem.type === 'document' && historyItem.doc1Id && historyItem.doc2Id) {
        setSelectedDoc1(historyItem.doc1Id);
        setSelectedDoc2(historyItem.doc2Id);
        setComparisonMode('documents');
        toast.info('Documents selected. Click "Compare Documents" to re-run the comparison.');
        return;
      }

      toast.error('Unable to replay this comparison. Data may have changed.');
    } catch (error) {
      console.error('Failed to replay comparison:', error);
      toast.error('Failed to replay comparison');
    }
  }, [user]);

  const handleSelectDocument = (docId: string) => {
    if (comparisonMode === 'versions' || comparisonMode === 'ai') {
      setSelectedDocumentId(docId);
      setSelectedBaseVersion(null);
      setSelectedCompareVersion(null);
    }
    setShowDocumentSelector(false);
  };

  const handleCompareVersions = async () => {
    if (!selectedBaseVersion || !selectedCompareVersion) return;

    try {
      const result = await compareVersions(selectedBaseVersion, selectedCompareVersion);
      setComparison(result);
      setShowComparisonDialog(true);

      const doc = documents.find(d => d.id === selectedDocumentId);
      saveToHistory({
        documentName: doc?.file_name || 'Unknown',
        baseVersion: `v${result.baseVersion.major_version}.${result.baseVersion.minor_version}`,
        compareVersion: `v${result.compareVersion.major_version}.${result.compareVersion.minor_version}`,
        changesCount: result.summary.added + result.summary.removed + result.summary.modified,
        type: 'version',
        documentId: selectedDocumentId || undefined,
        baseVersionId: selectedBaseVersion,
        compareVersionId: selectedCompareVersion,
      }, result);
    } catch (error) {
      console.error('Failed to compare versions:', error);
      toast.error('Failed to compare versions');
    }
  };

  const handleCompareDocuments = async () => {
    if (!selectedDoc1 || !selectedDoc2) return;

    setIsComparingDocs(true);
    try {
      const doc1 = documents.find(d => d.id === selectedDoc1);
      const doc2 = documents.find(d => d.id === selectedDoc2);

      // Fetch both documents' data
      const [doc1Data, doc2Data] = await Promise.all([
        supabase.from('documents').select('extracted_text, metadata, storage_path, file_name, file_type').eq('id', selectedDoc1).single(),
        supabase.from('documents').select('extracted_text, metadata, storage_path, file_name, file_type').eq('id', selectedDoc2).single(),
      ]);

      let text1 = doc1Data.data?.extracted_text || '';
      let text2 = doc2Data.data?.extracted_text || '';

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

      // Function to extract text from document via backend
      const extractTextFromDoc = async (storagePath: string, fileName: string, fileType: string): Promise<string> => {
        try {
          // Get signed URL for the document
          const { data: signedData } = await supabase.storage
            .from('documents')
            .createSignedUrl(storagePath, 300);
          
          if (!signedData?.signedUrl) {
            console.warn('Could not get signed URL for document:', fileName);
            return '';
          }

          // Call backend to extract content from document
          const response = await fetch(`${BACKEND_URL}/api/editor/extract-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              storage_url: signedData.signedUrl,
              file_type: fileType
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.content) {
              // Strip HTML tags for plain text comparison
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = result.content;
              return tempDiv.textContent || tempDiv.innerText || '';
            }
          }
          
          return '';
        } catch (error) {
          console.error('Error extracting text:', error);
          return '';
        }
      };

      // Extract text if not already available
      if (!text1 && doc1Data.data?.storage_path) {
        toast.info('Extracting text from first document...');
        text1 = await extractTextFromDoc(
          doc1Data.data.storage_path, 
          doc1Data.data.file_name || 'Document 1',
          doc1Data.data.file_type || 'application/octet-stream'
        );
      }
      if (!text2 && doc2Data.data?.storage_path) {
        toast.info('Extracting text from second document...');
        text2 = await extractTextFromDoc(
          doc2Data.data.storage_path, 
          doc2Data.data.file_name || 'Document 2',
          doc2Data.data.file_type || 'application/octet-stream'
        );
      }

      // Check if we have content to compare
      if (!text1 && !text2) {
        toast.error('Could not extract text from documents. Please ensure documents have been processed.');
        setIsComparingDocs(false);
        return;
      }

      if (!text1) {
        toast.warning('Could not extract text from first document. Using empty content.');
      }
      if (!text2) {
        toast.warning('Could not extract text from second document. Using empty content.');
      }

      // Create a comparison result
      const diffs = [];
      const lines1 = text1.split('\n').filter(l => l.trim());
      const lines2 = text2.split('\n').filter(l => l.trim());

      let addedCount = 0, removedCount = 0, modifiedCount = 0;

      // Simple line-by-line comparison
      const maxLines = Math.max(lines1.length, lines2.length);
      for (let i = 0; i < maxLines; i++) {
        const line1 = lines1[i] || '';
        const line2 = lines2[i] || '';

        if (line1 && !line2) {
          diffs.push({ type: 'removed' as const, path: `line_${i}`, oldValue: line1 });
          removedCount++;
        } else if (!line1 && line2) {
          diffs.push({ type: 'added' as const, path: `line_${i}`, newValue: line2 });
          addedCount++;
        } else if (line1 !== line2) {
          diffs.push({ type: 'modified' as const, path: `line_${i}`, oldValue: line1, newValue: line2 });
          modifiedCount++;
        }
      }

      const mockComparison: VersionComparison = {
        baseVersion: {
          id: selectedDoc1,
          document_id: selectedDoc1,
          major_version: 1,
          minor_version: 0,
          change_type: 'manual',
          is_current: true,
          created_at: doc1?.created_at || new Date().toISOString(),
          created_by: '',
          content: { text: text1 },
          tags: [],
          metadata: {},
        },
        compareVersion: {
          id: selectedDoc2,
          document_id: selectedDoc2,
          major_version: 1,
          minor_version: 0,
          change_type: 'manual',
          is_current: true,
          created_at: doc2?.created_at || new Date().toISOString(),
          created_by: '',
          content: { text: text2 },
          tags: [],
          metadata: {},
        },
        diffs,
        summary: {
          added: addedCount,
          removed: removedCount,
          modified: modifiedCount,
          unchanged: maxLines - addedCount - removedCount - modifiedCount,
        },
      };

      setComparison(mockComparison);
      setShowComparisonDialog(true);

      saveToHistory({
        documentName: `${doc1?.file_name} vs ${doc2?.file_name}`,
        baseVersion: doc1?.file_name || 'Doc 1',
        compareVersion: doc2?.file_name || 'Doc 2',
        changesCount: addedCount + removedCount + modifiedCount,
        type: 'document',
        doc1Id: selectedDoc1,
        doc2Id: selectedDoc2,
      }, mockComparison);

      toast.success('Documents compared successfully');
    } catch (error) {
      console.error('Failed to compare documents:', error);
      toast.error('Failed to compare documents');
    } finally {
      setIsComparingDocs(false);
    }
  };

  const handleAIAnalysis = async () => {
    if (!selectedBaseVersion || !selectedCompareVersion) return;
    if (!user) {
      toast.error('Please sign in to use AI analysis');
      return;
    }

    setIsAnalyzing(true);
    try {
      // First, check if we have a cached analysis
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      
      const cachedResponse = await fetch(
        `${BACKEND_URL}/api/ai/comparison?user_id=${user.id}&base_version_id=${selectedBaseVersion}&compare_version_id=${selectedCompareVersion}`
      );
      
      if (cachedResponse.ok) {
        const cachedData = await cachedResponse.json();
        if (cachedData && cachedData.analysis_text) {
          setAiAnalysisResult(cachedData.analysis_text);
          setShowAiResultDialog(true);
          
          const result = await compareVersions(selectedBaseVersion, selectedCompareVersion);
          const doc = documents.find(d => d.id === selectedDocumentId);
          saveToHistory({
            documentName: doc?.file_name || 'Unknown',
            baseVersion: `v${result.baseVersion.major_version}.${result.baseVersion.minor_version}`,
            compareVersion: `v${result.compareVersion.major_version}.${result.compareVersion.minor_version}`,
            changesCount: result.summary.added + result.summary.removed + result.summary.modified,
            type: 'ai',
            documentId: selectedDocumentId || undefined,
            baseVersionId: selectedBaseVersion,
            compareVersionId: selectedCompareVersion,
            aiAnalysisText: cachedData.analysis_text,
          }, result);
          
          toast.success('AI analysis loaded from cache');
          setIsAnalyzing(false);
          return;
        }
      }
      
      // No cached analysis, generate new one
      const result = await compareVersions(selectedBaseVersion, selectedCompareVersion);

      // Call AI to analyze the changes
      const prompt = `Analyze the following document version changes and provide a detailed summary:

Changes Summary:
- Added: ${result.summary.added} items
- Removed: ${result.summary.removed} items  
- Modified: ${result.summary.modified} items

Detailed Changes:
${result.diffs.slice(0, 20).map(d => `- ${d.type}: ${d.path} ${d.oldValue ? `(was: ${JSON.stringify(d.oldValue).slice(0, 100)})` : ''} ${d.newValue ? `(now: ${JSON.stringify(d.newValue).slice(0, 100)})` : ''}`).join('\n')}

Please provide:
1. A brief executive summary of what changed
2. Key changes that might be significant
3. Any potential issues or concerns
4. Recommendations for review`;

      const response = await fetch(`${BACKEND_URL}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context: 'document_comparison',
          user_id: user.id,
          document_id: selectedDocumentId,
          document_name: documents.find(d => d.id === selectedDocumentId)?.file_name || 'Unknown',
          comparison_type: 'ai',
          base_version: `v${result.baseVersion.major_version}.${result.baseVersion.minor_version}`,
          compare_version: `v${result.compareVersion.major_version}.${result.compareVersion.minor_version}`,
          base_version_id: selectedBaseVersion,
          compare_version_id: selectedCompareVersion,
          changes_count: result.summary.added + result.summary.removed + result.summary.modified,
          comparison_data: result,
        }),
      });

      let analysisText = '';

      if (response.ok) {
        const data = await response.json();
        analysisText = data.analysis || data.result || data.text || '';
      }

      // Fallback if AI endpoint not available
      if (!analysisText) {
        analysisText = `## Document Version Comparison Analysis

### Summary
This comparison shows changes between two versions of the document.

### Statistics
- **${result.summary.added}** new additions
- **${result.summary.removed}** deletions  
- **${result.summary.modified}** modifications
- **${result.summary.unchanged}** unchanged elements

### Key Changes
${result.diffs.filter(d => d.type !== 'unchanged').slice(0, 10).map(d =>
          `- **${d.type.charAt(0).toUpperCase() + d.type.slice(1)}**: ${d.path}`
        ).join('\n')}

### Recommendations
- Review all modified sections carefully
- Verify deletions were intentional
- Check new additions for accuracy

*Note: For more detailed AI analysis, configure the AI backend endpoint.*`;
      }

      setAiAnalysisResult(analysisText);
      setShowAiResultDialog(true);

      // Reload history to show the new AI analysis entry saved by backend
      if (user?.id) {
        const historyResponse = await fetch(`${BACKEND_URL}/api/ai/history/${user.id}?limit=50`);
        if (historyResponse.ok) {
          const data = await historyResponse.json();
          const transformed = data.map((item: any) => ({
            id: item.id,
            documentName: item.document_name,
            baseVersion: item.base_version,
            compareVersion: item.compare_version,
            timestamp: item.created_at,
            changesCount: item.changes_count,
            type: item.comparison_type,
            documentId: item.document_id,
            baseVersionId: item.base_version_id,
            compareVersionId: item.compare_version_id,
            doc1Id: item.doc1_id,
            doc2Id: item.doc2_id,
            comparisonData: item.comparison_data,
            aiAnalysisText: item.ai_analysis_text,
          }));
          setComparisonHistory(transformed);
        }
      }

      toast.success('AI analysis complete');
    } catch (error) {
      console.error('AI analysis failed:', error);
      toast.error('AI analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedDocument = documents.find(d => d.id === selectedDocumentId);
  const doc1Details = documents.find(d => d.id === selectedDoc1);
  const doc2Details = documents.find(d => d.id === selectedDoc2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Document Comparison</h2>
          <p className="text-muted-foreground">
            Compare document versions with visual diff and AI-powered analysis
          </p>
        </div>
        <Button onClick={() => { setComparisonMode('versions'); setShowDocumentSelector(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          New Comparison
        </Button>
      </div>

      {/* Comparison Mode Tabs */}
      <Tabs value={comparisonMode} onValueChange={(v) => setComparisonMode(v as ComparisonMode)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="versions" className="gap-2">
            <GitCompare className="h-4 w-4" />
            Compare Versions
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Compare Documents
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI Analysis
          </TabsTrigger>
        </TabsList>

        {/* Compare Versions Tab */}
        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-primary" />
                Compare Document Versions
              </CardTitle>
              <CardDescription>
                Select a document and compare two versions side-by-side
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Document Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Document</label>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => { setComparisonMode('versions'); setShowDocumentSelector(true); }}
                >
                  {selectedDocument ? (
                    <>
                      <FileText className="h-4 w-4" />
                      {selectedDocument.file_name}
                    </>
                  ) : (
                    <>
                      <FolderOpen className="h-4 w-4" />
                      Choose a document...
                    </>
                  )}
                </Button>
              </div>

              {selectedDocumentId && (
                <>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No versions available for this document</p>
                      <p className="text-sm">Create versions to enable comparison</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Base Version Selector */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Base Version</label>
                          <Select value={selectedBaseVersion || ''} onValueChange={setSelectedBaseVersion}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select base version" />
                            </SelectTrigger>
                            <SelectContent>
                              {versions.map((version) => (
                                <SelectItem
                                  key={version.id}
                                  value={version.id}
                                  disabled={version.id === selectedCompareVersion}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">v{version.major_version}.{version.minor_version}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {formatSafeDate(version.created_at)}
                                    </span>
                                    {version.is_current && (
                                      <Badge variant="secondary" className="text-xs">Current</Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Compare Version Selector */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Compare Version</label>
                          <Select value={selectedCompareVersion || ''} onValueChange={setSelectedCompareVersion}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select compare version" />
                            </SelectTrigger>
                            <SelectContent>
                              {versions.map((version) => (
                                <SelectItem
                                  key={version.id}
                                  value={version.id}
                                  disabled={version.id === selectedBaseVersion}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">v{version.major_version}.{version.minor_version}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {formatSafeDate(version.created_at)}
                                    </span>
                                    {version.is_current && (
                                      <Badge variant="secondary" className="text-xs">Current</Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <Button
                          onClick={handleCompareVersions}
                          disabled={!selectedBaseVersion || !selectedCompareVersion}
                          className="gap-2"
                        >
                          <GitCompare className="h-4 w-4" />
                          Compare Versions
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compare Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                Compare Two Documents
              </CardTitle>
              <CardDescription>
                Select two different documents and compare their content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Document 1 Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">First Document</label>
                  <Select value={selectedDoc1 || ''} onValueChange={setSelectedDoc1}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select first document" />
                    </SelectTrigger>
                    <SelectContent>
                      {documents.map((doc) => (
                        <SelectItem
                          key={doc.id}
                          value={doc.id}
                          disabled={doc.id === selectedDoc2}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-[200px]">{doc.file_name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {doc1Details && (
                    <p className="text-xs text-muted-foreground">
                      Updated: {formatSafeDate(doc1Details.updated_at, 'MMM d, yyyy')}
                    </p>
                  )}
                </div>

                {/* Document 2 Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Second Document</label>
                  <Select value={selectedDoc2 || ''} onValueChange={setSelectedDoc2}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select second document" />
                    </SelectTrigger>
                    <SelectContent>
                      {documents.map((doc) => (
                        <SelectItem
                          key={doc.id}
                          value={doc.id}
                          disabled={doc.id === selectedDoc1}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-[200px]">{doc.file_name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {doc2Details && (
                    <p className="text-xs text-muted-foreground">
                      Updated: {formatSafeDate(doc2Details.updated_at, 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={handleCompareDocuments}
                  disabled={!selectedDoc1 || !selectedDoc2 || isComparingDocs}
                  className="gap-2"
                >
                  {isComparingDocs ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Compare Documents
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                AI-Powered Analysis
              </CardTitle>
              <CardDescription>
                Get intelligent insights and summaries of document changes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Document Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Document</label>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => { setComparisonMode('ai'); setShowDocumentSelector(true); }}
                >
                  {selectedDocument ? (
                    <>
                      <FileText className="h-4 w-4" />
                      {selectedDocument.file_name}
                    </>
                  ) : (
                    <>
                      <FolderOpen className="h-4 w-4" />
                      Choose a document...
                    </>
                  )}
                </Button>
              </div>

              {selectedDocumentId && (
                <>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : versions.length < 2 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>At least 2 versions required for AI analysis</p>
                      <p className="text-sm">Create more versions to enable analysis</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Base Version Selector */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Base Version</label>
                          <Select value={selectedBaseVersion || ''} onValueChange={setSelectedBaseVersion}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select base version" />
                            </SelectTrigger>
                            <SelectContent>
                              {versions.map((version) => (
                                <SelectItem
                                  key={version.id}
                                  value={version.id}
                                  disabled={version.id === selectedCompareVersion}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">v{version.major_version}.{version.minor_version}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {formatSafeDate(version.created_at)}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Compare Version Selector */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Compare Version</label>
                          <Select value={selectedCompareVersion || ''} onValueChange={setSelectedCompareVersion}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select compare version" />
                            </SelectTrigger>
                            <SelectContent>
                              {versions.map((version) => (
                                <SelectItem
                                  key={version.id}
                                  value={version.id}
                                  disabled={version.id === selectedBaseVersion}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">v{version.major_version}.{version.minor_version}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {formatSafeDate(version.created_at)}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <Button
                          onClick={handleAIAnalysis}
                          disabled={!selectedBaseVersion || !selectedCompareVersion || isAnalyzing}
                          className="gap-2 bg-purple-600 hover:bg-purple-700"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Run AI Analysis
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Comparisons */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Comparisons</CardTitle>
              <CardDescription>Your comparison history</CardDescription>
            </div>
            {comparisonHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!user?.id) return;
                  // Delete all from database
                  try {
                    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
                    for (const item of comparisonHistory) {
                      await fetch(`${BACKEND_URL}/api/ai/history/${item.id}?user_id=${user.id}`, {
                        method: 'DELETE',
                      });
                    }
                  } catch (err) {
                    console.error('Error clearing from database:', err);
                  }
                  setComparisonHistory([]);
                  localStorage.removeItem('comparison_history');
                  toast.success('History cleared');
                }}
              >
                Clear History
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {comparisonHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No comparison history yet</p>
              <p className="text-sm">Start by comparing two document versions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {comparisonHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => handleReplayComparison(item)}
                    className="flex-1 flex items-center gap-3 cursor-pointer text-left"
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      item.type === 'version' && "bg-primary/10",
                      item.type === 'document' && "bg-amber-500/10",
                      item.type === 'ai' && "bg-purple-500/10"
                    )}>
                      {item.type === 'version' && <GitCompare className="h-4 w-4 text-primary" />}
                      {item.type === 'document' && <FileText className="h-4 w-4 text-amber-500" />}
                      {item.type === 'ai' && <Sparkles className="h-4 w-4 text-purple-500" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.documentName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{item.baseVersion}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono">{item.compareVersion}</span>
                        <span>•</span>
                        <span>{item.changesCount} changes</span>
                        <Badge variant="outline" className="text-xs">
                          {item.type === 'version' && 'Version'}
                          {item.type === 'document' && 'Document'}
                          {item.type === 'ai' && 'AI'}
                        </Badge>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatSafeDate(item.timestamp)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!user?.id) return;
                        try {
                          const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
                          const response = await fetch(`${BACKEND_URL}/api/ai/history/${item.id}?user_id=${user.id}`, {
                            method: 'DELETE',
                          });
                          if (response.ok) {
                            setComparisonHistory(prev => prev.filter(h => h.id !== item.id));
                            // Also remove from localStorage
                            const saved = localStorage.getItem('comparison_history');
                            if (saved) {
                              const localHistory = JSON.parse(saved);
                              const updated = localHistory.filter((h: any) => h.id !== item.id);
                              localStorage.setItem('comparison_history', JSON.stringify(updated));
                            }
                            toast.success('Comparison deleted');
                          } else {
                            toast.error('Failed to delete comparison');
                          }
                        } catch (err) {
                          console.error('Error deleting comparison:', err);
                          toast.error('Failed to delete comparison');
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Selector Dialog */}
      <Dialog open={showDocumentSelector} onOpenChange={setShowDocumentSelector}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Document</DialogTitle>
            <DialogDescription>
              Choose a document to compare versions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[300px]">
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No documents found</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredDocuments.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectDocument(doc.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                        'hover:bg-muted',
                        selectedDocumentId === doc.id && 'bg-primary/10 border border-primary/20'
                      )}
                    >
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSafeDate(doc.updated_at, 'MMM d, yyyy')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      <DocumentComparisonDialog
        open={showComparisonDialog}
        onOpenChange={setShowComparisonDialog}
        comparison={comparison}
      />

      {/* AI Analysis Result Dialog */}
      <Dialog open={showAiResultDialog} onOpenChange={setShowAiResultDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Analysis Results
            </DialogTitle>
            <DialogDescription>
              Intelligent summary of document changes
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4 scrollbar-hide">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {aiAnalysisResult?.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace('## ', '')}</h2>;
                }
                if (line.startsWith('### ')) {
                  return <h3 key={i} className="text-md font-semibold mt-3 mb-1">{line.replace('### ', '')}</h3>;
                }
                if (line.startsWith('- **')) {
                  return <p key={i} className="ml-4 my-1">{line}</p>;
                }
                if (line.startsWith('- ')) {
                  return <li key={i} className="ml-6 my-0.5">{line.replace('- ', '')}</li>;
                }
                if (line.startsWith('*')) {
                  return <p key={i} className="text-muted-foreground italic text-sm mt-4">{line.replace(/\*/g, '')}</p>;
                }
                return line ? <p key={i} className="my-1">{line}</p> : <br key={i} />;
              })}
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowAiResultDialog(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(aiAnalysisResult || '');
                toast.success('Analysis copied to clipboard');
              }}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Copy to Clipboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
