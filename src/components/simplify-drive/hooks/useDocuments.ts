import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getAllOfflineDocuments } from '@/services/offlineStorage';
import type { Document, DocumentStats, SortOrder } from '../types';

const SUPABASE_URL = 'https://nvdkgfptnqardtxlqoym.supabase.co';

interface UseDocumentsOptions {
  sortBy?: string;
  sortOrder?: SortOrder;
  selectedFolder?: string;
}

export function useDocuments(options: UseDocumentsOptions = {}) {
  const { sortBy = 'created_at', sortOrder = 'desc', selectedFolder = 'all' } = options;
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const { toast } = useToast();

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch offline documents from IndexedDB
  const fetchOfflineDocuments = useCallback(async () => {
    try {
      console.log('📴 Fetching offline documents from IndexedDB...');
      const offlineDocs = await getAllOfflineDocuments();
      
      const processedDocuments: Document[] = offlineDocs.map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        file_type: doc.file_type,
        file_size: doc.file_size,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        extracted_text: doc.extracted_text || '',
        processing_status: doc.processing_status || 'completed',
        metadata: { 
          ...doc.metadata, 
          is_offline: true,
          is_pending_upload: doc.metadata?.is_pending_upload || false,
        },
        storage_url: doc.storage_url,
        storage_path: undefined,
        insights: undefined,
        tags: [],
        folders: []
      }));
      
      console.log('📴 Loaded', processedDocuments.length, 'offline documents (including pending uploads)');
      setDocuments(processedDocuments);
      
      if (processedDocuments.length > 0) {
        const pendingCount = processedDocuments.filter(d => d.metadata?.is_pending_upload).length;
        if (pendingCount > 0) {
          toast({
            title: "Offline Mode",
            description: `${pendingCount} document(s) queued for upload. ${processedDocuments.length - pendingCount} cached documents available.`,
          });
        } else {
          toast({
            title: "Offline Mode",
            description: `Showing ${processedDocuments.length} cached documents`,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching offline documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDocuments = useCallback(async () => {
    // If offline, fetch from IndexedDB instead
    if (!navigator.onLine) {
      console.log('📴 Offline detected, loading from IndexedDB...');
      await fetchOfflineDocuments();
      return;
    }
    
    try {
      const { data: user, error: userError } = await supabase.auth.getUser();
      
      // If auth fails (network error), try offline mode
      if (userError || !user.user) {
        console.log('❌ Auth failed, falling back to offline mode:', userError?.message);
        await fetchOfflineDocuments();
        return;
      }

      console.log('📊 useDocuments: Fetching documents for folder:', selectedFolder);

      // If recycle bin is selected, fetch deleted documents via API
      if (selectedFolder === 'recycle-bin') {
        console.log('🗑️ Fetching deleted documents from API...');
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/api/v1/documents/${user.user.id}/deleted`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch deleted documents');
        }
        
        const data = await response.json();
        console.log('🗑️ Deleted documents response:', data);
        
        const processedDocuments: Document[] = (data.documents || []).map((doc: any) => {
          const displayName = doc.file_name || doc.original_name || doc.name || doc.file_path?.split('/').pop() || 'Unknown';
          
          return {
            id: doc.id,
            file_name: displayName,
            file_type: doc.document_type || doc.mime_type || doc.file_type || 'unknown',
            file_size: doc.file_size || 0,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            extracted_text: doc.extracted_text || '',
            processing_status: doc.processing_status || 'completed',
            metadata: { ...doc.metadata, is_deleted: true },
            storage_url: doc.storage_url,
            storage_path: doc.storage_path,
            insights: undefined,
            tags: [],
            folders: []
          };
        });
        
        console.log('🗑️ Processed deleted documents:', processedDocuments.length);
        setDocuments(processedDocuments);
        return;
      }

      // Otherwise fetch regular (non-deleted) documents
      console.log('📊 useDocuments: Fetching documents. selectedFolder:', selectedFolder);
      
      let query = supabase
        .from('documents')
        .select('*')
        .or(`uploaded_by.eq.${user.user.id},user_id.eq.${user.user.id}`)
        .eq('is_deleted', false);

      // If a specific folder is selected (not 'all' or special folders), filter by folder
      if (selectedFolder && selectedFolder !== 'all' && selectedFolder !== 'media-browser' && selectedFolder !== 'recycle-bin') {
        console.log('📁 Fetching documents for specific folder:', selectedFolder);
        
        // Get document IDs from both document_shortcuts AND document_folder_relationships
        const documentIdSet = new Set<string>();
        
        // Check document_shortcuts (manual assignments)
        const { data: shortcuts, error: shortcutsError } = await supabase
          .from('document_shortcuts')
          .select('document_id')
          .eq('folder_id', selectedFolder);

        if (shortcutsError) {
          console.error('Error fetching folder shortcuts:', shortcutsError);
        } else {
          shortcuts?.forEach(s => documentIdSet.add(s.document_id));
        }
        
        // Check document_folder_relationships (AI-assigned)
        const { data: relationships, error: relError } = await supabase
          .from('document_folder_relationships')
          .select('document_id')
          .eq('folder_id', selectedFolder);

        if (relError) {
          console.error('Error fetching folder relationships:', relError);
        } else {
          relationships?.forEach(r => documentIdSet.add(r.document_id));
        }

        const documentIds = Array.from(documentIdSet);
        console.log('📁 Document IDs in folder:', documentIds);

        if (documentIds.length === 0) {
          // No documents in this folder
          setDocuments([]);
          setLoading(false);
          return;
        }

        // Filter to only show documents in this folder
        query = query.in('id', documentIds);
      }

      const { data: documentsData, error } = await (query.order('created_at', { ascending: false }) as any);

      console.log('📊 useDocuments: Query result - documents count:', documentsData?.length || 0);

      if (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: "Error loading documents",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Fetch folder relationships for all documents
      const documentIds = documentsData?.map((doc: any) => doc.id) || [];
      let foldersByDocument: { [key: string]: any[] } = {};
      
      if (documentIds.length > 0) {
        const { data: shortcuts } = await supabase
          .from('document_shortcuts')
          .select(`
            document_id,
            folder_id,
            smart_folders (
              id,
              name,
              color,
              icon,
              document_count
            )
          `)
          .in('document_id', documentIds);

        // Group folders by document ID
        shortcuts?.forEach((shortcut: any) => {
          if (!foldersByDocument[shortcut.document_id]) {
            foldersByDocument[shortcut.document_id] = [];
          }
          if (shortcut.smart_folders) {
            foldersByDocument[shortcut.document_id].push(shortcut.smart_folders);
          }
        });
      }

      // Generate signed URLs for documents with storage_path
      const documentsWithUrls = await Promise.all(
        (documentsData || []).map(async (doc: any) => {
          let storageUrl = doc.original_url || undefined;
          
          // Generate signed URL from storage_path for offline downloads (valid for 1 hour)
          if (!storageUrl && doc.storage_path) {
            try {
              const { data, error } = await supabase.storage
                .from('documents')
                .createSignedUrl(doc.storage_path, 3600); // 1 hour expiry
              
              if (!error && data?.signedUrl) {
                storageUrl = data.signedUrl;
              }
            } catch (err) {
              console.warn('Failed to generate signed URL for:', doc.storage_path);
            }
          }
          
          return { ...doc, storageUrl };
        })
      );

      const processedDocuments: Document[] = documentsWithUrls.map((doc: any) => {
        const displayName = doc.file_name || doc.original_name || doc.name || doc.file_path?.split('/').pop() || 'Unknown';
        
        // Transform analysis_result from database to insights format
        const analysisResult = doc.analysis_result;
        const insights = analysisResult && Object.keys(analysisResult).length > 0 ? {
          summary: analysisResult.summary || '',
          key_topics: analysisResult.key_topics || [],
          importance_score: analysisResult.importance_score || 0,
          estimated_reading_time: analysisResult.estimated_reading_time || 0,
          ai_generated_title: analysisResult.ai_generated_title || displayName,
          suggested_actions: analysisResult.suggested_actions || []
        } : undefined;
        
        return {
          id: doc.id,
          file_name: displayName,
          file_type: doc.document_type || doc.mime_type || 'unknown',
          file_size: doc.file_size || 0,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          extracted_text: doc.extracted_text || '',
          processing_status: doc.processing_status || 'pending',
          metadata: doc.metadata || {},
          storage_url: doc.storageUrl,
          storage_path: doc.storage_path,
          insights: insights,
          tags: [],
          folders: foldersByDocument[doc.id] || []
        };
      });
      console.log('📊 useDocuments: Processed documents count:', processedDocuments.length);
      console.log('📊 useDocuments: Sample document:', processedDocuments[0]);
      
      // Also fetch pending uploads from IndexedDB (even when online)
      // so they remain visible with "Queued for Upload" badge
      try {
        const offlineDocs = await getAllOfflineDocuments();
        const pendingUploads = offlineDocs.filter(doc => doc.metadata?.is_pending_upload);
        
        if (pendingUploads.length > 0) {
          console.log('📤 Found', pendingUploads.length, 'pending uploads in IndexedDB');
          
          // Convert to Document format
          const pendingDocuments: Document[] = pendingUploads.map((doc) => ({
            id: doc.id,
            file_name: doc.file_name,
            file_type: doc.file_type,
            file_size: doc.file_size,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            extracted_text: doc.extracted_text || '',
            processing_status: 'pending',
            metadata: { 
              ...doc.metadata, 
              is_pending_upload: true,
            },
            storage_url: doc.storage_url,
            storage_path: undefined,
            insights: undefined,
            tags: [],
            folders: []
          }));
          
          // Merge with Supabase documents (pending uploads first)
          setDocuments([...pendingDocuments, ...processedDocuments]);
        } else {
          setDocuments(processedDocuments);
        }
      } catch (offlineError) {
        console.warn('Could not fetch pending uploads from IndexedDB:', offlineError);
        setDocuments(processedDocuments);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching from server:', error);
      
      // If fetch fails (network error), try offline mode
      console.log('📴 Server fetch failed, trying offline fallback...');
      try {
        await fetchOfflineDocuments();
      } catch (offlineError) {
        console.error('Offline fallback also failed:', offlineError);
        toast({
          title: "Error",
          description: "Failed to load documents. Check your connection.",
          variant: "destructive",
        });
        setDocuments([]);
        setLoading(false);
      }
    }
  }, [toast, selectedFolder, fetchOfflineDocuments]);

  useEffect(() => {
    console.log('🔄 useDocuments: useEffect triggered, selectedFolder:', selectedFolder, 'isOffline:', !navigator.onLine);
    fetchDocuments();
  }, [fetchDocuments, selectedFolder, isOfflineMode]);

  const stats: DocumentStats = useMemo(() => {
    const totalDocs = documents.length;
    const processedDocs = documents.filter(doc => doc.processing_status === 'completed').length;
    const totalSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
    const avgImportance = totalDocs > 0 
      ? documents.reduce((sum, doc) => sum + (doc.insights?.importance_score || 0), 0) / totalDocs
      : 0;

    return {
      totalDocs,
      processedDocs,
      totalSize: (totalSize / (1024 * 1024)).toFixed(1) + ' MB',
      avgImportance: (avgImportance * 100).toFixed(0) + '%'
    };
  }, [documents]);

  return {
    documents,
    loading,
    stats,
    refetch: fetchDocuments,
  };
}
