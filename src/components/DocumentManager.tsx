import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  Search, 
  Upload, 
  Folder, 
  Filter, 
  SortAsc, 
  Grid, 
  List, 
  Brain, 
  FileText, 
  Star,
  Clock,
  Tag,
  Eye,
  Download,
  Share,
  Share2,
  MoreHorizontal,
  Sparkles,
  Lightbulb,
  TrendingUp,
  FolderKanban,
  MessageCircle,
  Lock,
  Workflow,
  BarChart3,
  PenTool,
  Shield,
  Scale,
  Activity,
  GitCompare,
  Zap,
  Droplets,
  UserMinus,
  ChevronRight,
  Scan
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSemanticSearch } from "@/hooks/useSemanticSearch";
import { useDocumentTypes } from "@/hooks/useDocumentTypes";
import { SmartSearch } from './document-manager/SmartSearch';
import { SmartFolders } from './document-manager/SmartFolders';
import { DocumentInsights } from './document-manager/DocumentInsights';
import { AIRecommendations } from './document-manager/AIRecommendations';
import { DocumentGrid } from './document-manager/DocumentGrid';
import { DocumentList } from './document-manager/DocumentList';
import { DocumentTypeFilters } from './document-manager/DocumentTypeFilters';
import { DocumentChatbot } from './document-manager/DocumentChatbot';
import { DocumentTypeBuckets } from './document-manager/DocumentTypeBuckets';
import { DocumentViewer } from './document-manager/DocumentViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UnifiedDocumentUpload } from './UnifiedDocumentUpload';
import { BatchDocumentScanner } from './scanning/BatchDocumentScanner';
import { API_BASE_URL } from "@/config/api";
import { cn } from "@/lib/utils";

// New Feature Dashboards
import { ShareLinksDashboard } from './sharing/ShareLinksDashboard';
import { ComplianceDashboard } from './compliance/ComplianceDashboard';
import { RetentionDashboard } from './retention/RetentionDashboard';
import { LegalHoldDashboard } from './legal-hold/LegalHoldDashboard';
import { SignatureDashboard } from './signatures/SignatureDashboard';
import { CheckInOutDashboard } from './checkinout/CheckInOutDashboard';
import { WorkflowDashboard } from './workflows/WorkflowDashboard';
import { WorkflowAnalyticsDashboard } from './workflows/WorkflowAnalyticsDashboard';
import AuditDashboard from './audit/AuditDashboard';
import { ComparisonDashboard } from './document-comparison';
import { SummaryDashboard } from './document-summary';
import { FavoritesDashboard } from './favorites';
import { QuickAccessPanel } from './quick-access';
import { PendingTransfersPanel } from './ownership';
import { CustomMetadataManager } from './metadata';
import { WatermarkEditor } from './watermark';
import { ExternalSharingPanel } from './external-sharing';
import { ContentAccessRulesPanel } from './content-rules';
import { ProcessingQueuePanel } from './scalable';
import { MigrationDashboard } from './migration';

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  extracted_text: string;
  processing_status: string;
  metadata: any;
  storage_url?: string;
  document_type?: string;
  insights?: DocumentInsight;
  tags?: DocumentTag[];
  folders?: SmartFolder[];
}

interface DocumentInsight {
  summary: string;
  key_topics: string[];
  importance_score: number;
  estimated_reading_time: number;
  ai_generated_title: string;
  suggested_actions: string[];
}

interface DocumentTag {
  id: string;
  name: string;
  is_ai_suggested: boolean;
  confidence_score: number;
}

interface SmartFolder {
  id: string;
  name: string;
  color: string;
  icon: string;
  document_count: number;
}

interface FeatureTab {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  badge?: string;
  category?: 'core' | 'ai' | 'collaboration' | 'compliance' | 'admin';
}

const FEATURE_TABS: FeatureTab[] = [
  // Core Features
  { id: 'documents', label: 'Documents', icon: FileText, description: 'Manage all your documents', category: 'core' },
  { id: 'quickaccess', label: 'Quick Access', icon: Zap, description: 'Priority and frequently accessed documents', badge: 'New', category: 'core' },
  { id: 'favorites', label: 'Starred', icon: Star, description: 'Quick access to starred documents', category: 'core' },
  
  // AI Features
  { id: 'summaries', label: 'AI Summaries', icon: Sparkles, description: 'Generate AI document summaries', category: 'ai' },
  { id: 'compare', label: 'Compare', icon: GitCompare, description: 'Compare document versions', category: 'ai' },
  
  // Collaboration
  { id: 'externalsharing', label: 'Guest Sharing', icon: Share2, description: 'Share with external users', badge: 'New', category: 'collaboration' },
  { id: 'sharing', label: 'Share Links', icon: Share2, description: 'Manage shared links & permissions', category: 'collaboration' },
  { id: 'checkinout', label: 'Check In/Out', icon: Lock, description: 'Document locking & checkout', category: 'collaboration' },
  { id: 'transfers', label: 'Transfers', icon: UserMinus, description: 'Ownership transfers', badge: 'New', category: 'collaboration' },
  
  // Content Management
  { id: 'contentrules', label: 'Access Rules', icon: Shield, description: 'Content-based access control', badge: 'New', category: 'compliance' },
  { id: 'metadata', label: 'Metadata', icon: Tag, description: 'Custom metadata fields', badge: 'New', category: 'compliance' },
  { id: 'watermarks', label: 'Watermarks', icon: Droplets, description: 'Document watermark settings', badge: 'New', category: 'compliance' },
  
  // Workflows
  { id: 'workflows', label: 'Workflows', icon: Workflow, description: 'Automate document processes', category: 'admin' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Workflow analytics & insights', category: 'admin' },
  { id: 'signatures', label: 'E-Signatures', icon: PenTool, description: 'Electronic signature requests', category: 'admin' },
  
  // Compliance & Legal
  { id: 'compliance', label: 'Compliance', icon: Shield, description: 'Compliance labels & policies', category: 'compliance' },
  { id: 'retention', label: 'Retention', icon: Clock, description: 'Retention policies & disposal', category: 'compliance' },
  { id: 'legalhold', label: 'Legal Hold', icon: Scale, description: 'Legal holds & preservation', category: 'compliance' },
  { id: 'audit', label: 'Audit Trail', icon: Activity, description: 'Activity logs & audit reports', category: 'compliance' },
  
  // Admin & System
  { id: 'pipeline', label: 'Processing', icon: Zap, description: 'Document processing pipeline', badge: 'New', category: 'admin' },
  { id: 'migration', label: 'Migration', icon: Upload, description: 'Migrate docs from Google Drive, OneDrive, FileNet', badge: 'New', category: 'admin' },
];

export const DocumentManager: React.FC = () => {
  // Active Feature Tab
  const [activeFeature, setActiveFeature] = useState('documents');
  
  // Document state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(true);
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatbotMinimized, setChatbotMinimized] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [documentStats, setDocumentStats] = useState({
    total: 0,
    totalSize: 0,
    aiProcessed: 0
  });
  const [refreshCounter, setRefreshCounter] = useState(0);
  const { toast } = useToast();
  const { searchDocuments, isSearching, results: semanticResults, clearResults } = useSemanticSearch();
  const { types: documentTypes, loading: typesLoading, refreshTypes } = useDocumentTypes();

  useEffect(() => {
    fetchDocuments();
  }, [selectedFolder, selectedDocumentType, refreshCounter]);

  useEffect(() => {
    if (!isSemanticSearch) {
      filterAndSortDocuments();
    }
  }, [documents, searchQuery, selectedFolder, selectedTag, selectedDocumentType, sortBy, sortOrder, isSemanticSearch]);

  useEffect(() => {
    if (isSemanticSearch) {
      filterAndSortDocuments();
    }
  }, [semanticResults, isSemanticSearch]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      // If a folder is selected, fetch only documents in that folder for better performance
      let response;
      if (selectedFolder === 'recycle-bin') {
        console.log('🗑️ Fetching deleted documents (recycle bin) for user:', user.user.id);
        response = await fetch(`${API_BASE_URL}/api/v1/documents/${user.user.id}/deleted`);
      } else if (selectedFolder && selectedFolder !== 'all') {
        console.log('Fetching documents for folder:', selectedFolder);
        response = await fetch(`${API_BASE_URL}/api/v1/folders/${selectedFolder}/documents`);
      } else {
        console.log('Fetching all documents for user:', user.user.id);
        response = await fetch(`${API_BASE_URL}/api/v1/documents/${user.user.id}?document_type=${selectedDocumentType}`);
      }
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        console.error('Failed to fetch documents:', response.status);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        setDocuments([]);
        setDocumentStats({
          total: 0,
          totalSize: 0,
          aiProcessed: 0
        });
        return;
      }

      const data = await response.json();
      console.log('📦 Received data:', data);
      console.log('📊 Documents count:', data.documents?.length || 0);
      
      setDocuments(data.documents || []);
      setDocumentStats({
        total: data.total_documents || 0,
        totalSize: data.total_size || 0,
        aiProcessed: data.documents?.filter((d: any) => d.processing_status === 'completed').length || 0
      });
      
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments([]);
      setDocumentStats({
        total: 0,
        totalSize: 0,
        aiProcessed: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortDocuments = () => {
    if (isSemanticSearch && semanticResults.length > 0) {
      setFilteredDocuments(semanticResults.map(result => ({
        id: result.id,
        file_name: result.file_name,
        file_type: result.document_type || 'unknown',
        file_size: result.file_size || 0,
        created_at: result.created_at,
        updated_at: result.updated_at,
        extracted_text: result.extracted_text || '',
        processing_status: result.processing_status || 'completed',
        metadata: {},
        insights: undefined,
        tags: [],
        folders: []
      })));
      return;
    }

    let filtered = documents.filter(doc => {
      const matchesSearch = searchQuery === '' || 
        doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.extracted_text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.insights?.summary?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFolder = selectedFolder === 'all' || 
        doc.folders?.some(folder => folder.id === selectedFolder);

      const matchesTag = selectedTag === 'all' || 
        doc.tags?.some(tag => tag.id === selectedTag);

      const matchesDocumentType = selectedDocumentType === 'all' || 
        doc.document_type === selectedDocumentType;

      return matchesSearch && matchesFolder && matchesTag && matchesDocumentType;
    });

    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.file_name.toLowerCase();
          bValue = b.file_name.toLowerCase();
          break;
        case 'size':
          aValue = a.file_size;
          bValue = b.file_size;
          break;
        case 'importance':
          aValue = a.insights?.importance_score || 0;
          bValue = b.insights?.importance_score || 0;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredDocuments(filtered);
  };

  const handleDocumentUpload = () => {
    setShowUploadModal(true);
  };

  const handleDocumentProcessed = useCallback((documentId: string) => {
    console.log('Document processed:', documentId);
    setShowUploadModal(false);
    setShowScannerModal(false);
    fetchDocuments();
    refreshTypes();
    setRefreshCounter(prev => prev + 1);
    organizeDocumentInSmartFolders(documentId);
    toast({
      title: "Document uploaded successfully",
      description: "Your document has been processed and organized automatically",
    });
  }, []);

  const handleRefresh = useCallback(() => {
    fetchDocuments();
    setRefreshCounter(prev => prev + 1);
  }, []);

  const handleDocumentClick = (document: Document) => {
    setSelectedDocument(document);
    setShowDocumentViewer(true);
  };

  const handleViewDocument = useCallback((doc: Document) => {
    if (doc.storage_url) {
      window.open(doc.storage_url, '_blank');
    }
  }, []);

  const handleDownloadDocument = useCallback((doc: Document) => {
    if (doc.storage_url) {
      window.open(doc.storage_url, '_blank');
    }
  }, []);

  const organizeDocumentInSmartFolders = async (documentId: string) => {
    try {
      const fastApiUrl = (import.meta as any).env.VITE_FASTAPI_URL;
      if (!fastApiUrl) throw new Error('VITE_FASTAPI_URL is required');
      const response = await fetch(`${fastApiUrl}/api/v1/organize-smart-folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Document Organized",
          description: `Document organized into ${result.organizationResults.length} smart folders`,
        });
      } else {
        console.warn('Failed to organize document in smart folders');
      }
    } catch (error) {
      console.error('Error organizing document in smart folders:', error);
    }
  };

  const getDocumentStats = () => {
    const totalDocs = documents.length;
    const processedDocs = documents.filter(doc => doc.processing_status === 'completed').length;
    const totalSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
    const avgImportance = documents.reduce((sum, doc) => sum + (doc.insights?.importance_score || 0), 0) / totalDocs;

    return {
      totalDocs,
      processedDocs,
      totalSize: (totalSize / (1024 * 1024)).toFixed(1) + ' MB',
      avgImportance: totalDocs > 0 ? (avgImportance * 100).toFixed(0) + '%' : '0%'
    };
  };

  const stats = getDocumentStats();
  const activeTab = FEATURE_TABS.find(t => t.id === activeFeature);
  const isDocumentsView = activeFeature === 'documents';

  // Render feature content based on active tab
  const renderFeatureContent = () => {
    const simpleDocuments = documents.map(d => ({
      id: d.id,
      file_name: d.file_name,
      file_type: d.file_type,
      file_size: d.file_size,
      created_at: d.created_at,
      storage_url: d.storage_url,
    }));

    switch (activeFeature) {
      case 'quickaccess':
        return (
          <QuickAccessPanel 
            documents={simpleDocuments}
            onViewDocument={(doc) => {
              const fullDoc = documents.find(d => d.id === doc.id);
              if (fullDoc) handleViewDocument(fullDoc);
            }}
            onDownloadDocument={(doc) => {
              const fullDoc = documents.find(d => d.id === doc.id);
              if (fullDoc) handleDownloadDocument(fullDoc);
            }}
          />
        );

      case 'favorites':
        return (
          <FavoritesDashboard 
            documents={simpleDocuments}
            onViewDocument={(id) => {
              const doc = documents.find(d => d.id === id);
              if (doc) handleViewDocument(doc);
            }}
            onDownloadDocument={(id) => {
              const doc = documents.find(d => d.id === id);
              if (doc) handleDownloadDocument(doc);
            }}
          />
        );

      case 'summaries':
        return (
          <SummaryDashboard 
            documents={documents.map(d => ({
              id: d.id,
              file_name: d.file_name,
              file_type: d.file_type,
              created_at: d.created_at,
              extracted_text: d.extracted_text,
              processing_status: d.processing_status,
            }))} 
          />
        );

      case 'compare':
        return (
          <ComparisonDashboard 
            documents={documents.map(d => ({
              id: d.id,
              file_name: d.file_name,
              file_type: d.file_type,
              created_at: d.created_at,
              updated_at: d.updated_at,
            }))} 
          />
        );

      case 'externalsharing':
        return <ExternalSharingPanel documents={simpleDocuments.map(d => ({ id: d.id, file_name: d.file_name }))} />;

      case 'contentrules':
        return <ContentAccessRulesPanel />;

      case 'metadata':
        return <CustomMetadataManager />;

      case 'watermarks':
        return <WatermarkEditor />;

      case 'transfers':
        return <PendingTransfersPanel />;

      case 'sharing':
        return <ShareLinksDashboard />;

      case 'checkinout':
        return <CheckInOutDashboard />;

      case 'workflows':
        return <WorkflowDashboard />;

      case 'analytics':
        return <WorkflowAnalyticsDashboard />;

      case 'signatures':
        return <SignatureDashboard />;

      case 'compliance':
        return <ComplianceDashboard />;

      case 'retention':
        return <RetentionDashboard />;

      case 'legalhold':
        return <LegalHoldDashboard />;

      case 'audit':
        return <AuditDashboard title="Document Manager Audit Trail" showStats={true} />;

      case 'pipeline':
        return <ProcessingQueuePanel />;

      case 'migration':
        return <MigrationDashboard />;

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Feature Navigation Tabs */}
      <div className="border-b bg-card/50 sticky top-0 z-40">
        <ScrollArea className="w-full">
          <div className="flex items-center gap-1 p-2 min-w-max">
            {FEATURE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeFeature === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFeature(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {tab.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        
        {/* Breadcrumb */}
        {activeTab && !isDocumentsView && (
          <div className="px-4 py-2 border-t bg-muted/30 flex items-center gap-2 text-sm">
            <button 
              onClick={() => setActiveFeature('documents')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              AI Document Manager
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium flex items-center gap-2">
              <activeTab.icon className="h-4 w-4" />
              {activeTab.label}
            </span>
          </div>
        )}
      </div>

      {/* Main Content - Documents View OR Feature View */}
      {isDocumentsView ? (
        <>
          {/* Header for Documents View */}
          <div className="border-b bg-card/50">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Brain className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                      AI Document Manager
                      <Sparkles className="w-5 h-5 text-primary" />
                    </h1>
                    <p className="text-muted-foreground">Intelligent document organization and insights</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setShowScannerModal(true)} className="flex items-center gap-2">
                    <Scan className="w-4 h-4" />
                    Scan
                  </Button>
                  <Button onClick={handleDocumentUpload} className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Documents
                  </Button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{documentStats.total}</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">Total Documents</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100">{documentStats.aiProcessed}</p>
                        <p className="text-sm text-green-700 dark:text-green-300">AI Processed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Star className="w-8 h-8 text-purple-600" />
                      <div>
                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{stats.avgImportance}</p>
                        <p className="text-sm text-purple-700 dark:text-purple-300">Avg Importance</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Lightbulb className="w-8 h-8 text-orange-600" />
                      <div>
                        <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                          {(documentStats.totalSize / 1024 / 1024).toFixed(1)} MB
                        </p>
                        <p className="text-sm text-orange-700 dark:text-orange-300">Total Size</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[300px]">
                  <SmartSearch 
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    onSemanticSearch={async (query) => {
                      setIsSemanticSearch(true);
                      setSearchQuery(query);
                      await searchDocuments(query);
                    }}
                  />
                </div>
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Date Created</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="size">File Size</SelectItem>
                    <SelectItem value="importance">AI Importance</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  <SortAsc className={`w-4 h-4 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                </Button>

                <div className="flex items-center gap-1 border rounded-lg p-1">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Documents Content with Sidebar */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <div className="w-80 border-r bg-card/30 p-4 overflow-y-auto">
              <Tabs defaultValue="folders">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="folders">Folders</TabsTrigger>
                  <TabsTrigger value="types">Types</TabsTrigger>
                  <TabsTrigger value="insights">AI</TabsTrigger>
                </TabsList>
                
                <TabsContent value="folders" className="mt-4">
                  <SmartFolders
                    onFolderSelect={(folderId) => {
                      console.log('Folder selected:', folderId);
                      setSelectedFolder(folderId);
                    }}
                    selectedFolder={selectedFolder}
                  />
                </TabsContent>

                <TabsContent value="types" className="mt-4">
                  <DocumentTypeBuckets
                    onTypeSelect={setSelectedDocumentType}
                    selectedType={selectedDocumentType}
                    refreshTrigger={refreshCounter}
                  />
                </TabsContent>
                
                <TabsContent value="insights" className="mt-4">
                  <div className="space-y-4">
                    <DocumentInsights documents={filteredDocuments} />
                    <AIRecommendations documents={filteredDocuments} onRefresh={handleRefresh} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Document View */}
            <div className="flex-1 p-4 overflow-y-auto">
              {filteredDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="w-16 h-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No documents found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? 'Try adjusting your search query' : 'Upload your first document to get started'}
                  </p>
                  <Button onClick={handleDocumentUpload}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="secondary">
                      {filteredDocuments.length} documents
                    </Badge>
                    {searchQuery && (
                      <Badge variant="outline">
                        Search: "{searchQuery}"
                      </Badge>
                    )}
                  </div>

                  {viewMode === 'grid' ? (
                    <DocumentGrid 
                      documents={filteredDocuments}
                      onDocumentClick={handleDocumentClick}
                      onRefresh={fetchDocuments}
                    />
                  ) : (
                    <DocumentList 
                      documents={filteredDocuments}
                      onDocumentClick={handleDocumentClick}
                      onRefresh={fetchDocuments}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        // Feature Content View
        <div className="flex-1 overflow-auto p-4">
          {renderFeatureContent()}
        </div>
      )}

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
          </DialogHeader>
          <UnifiedDocumentUpload 
            onDocumentProcessed={handleDocumentProcessed}
            onComplete={() => setShowUploadModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Scanner Modal */}
      <Dialog open={showScannerModal} onOpenChange={setShowScannerModal}>
        <DialogContent className="sm:max-w-[1200px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Document Scanner</DialogTitle>
          </DialogHeader>
          <BatchDocumentScanner 
            onBatchComplete={(batch) => {
              console.log('Scan batch complete:', batch);
              setShowScannerModal(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* AI Chatbot - Fixed position */}
      {showChatbot && (
        <DocumentChatbot 
          onClose={() => setShowChatbot(false)}
          isMinimized={chatbotMinimized}
          onToggleMinimize={() => setChatbotMinimized(!chatbotMinimized)}
        />
      )}

      {/* Document Viewer Modal */}
      <DocumentViewer
        document={selectedDocument}
        isOpen={showDocumentViewer}
        onClose={() => {
          setShowDocumentViewer(false);
          setSelectedDocument(null);
        }}
      />

      {/* Floating Chatbot Button (when closed) */}
      {!showChatbot && (
        <Button
          className="fixed bottom-4 right-4 w-14 h-14 rounded-full shadow-lg"
          size="icon"
          onClick={() => {
            setShowChatbot(true);
            setChatbotMinimized(false);
          }}
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
};
