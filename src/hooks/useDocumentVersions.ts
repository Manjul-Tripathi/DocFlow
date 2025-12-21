import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type {
  DocumentVersion,
  VersionBranch,
  VersionComment,
  CreateVersionParams,
  RestoreVersionParams,
  CreateBranchParams,
  VersionComparison,
  VersionDiff,
} from '@/types/versionControl';

interface UseDocumentVersionsOptions {
  documentId: string;
  autoRefresh?: boolean;
}

export function useDocumentVersions({ documentId, autoRefresh = true }: UseDocumentVersionsOptions) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [branches, setBranches] = useState<VersionBranch[]>([]);
  const [currentVersion, setCurrentVersion] = useState<DocumentVersion | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all versions for a document
  const fetchVersions = useCallback(async () => {
    if (!documentId) return;

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false });

      if (fetchError) {
        // If the table doesn't exist (404), just set empty versions
        if (fetchError.code === 'PGRST116' || fetchError.message?.includes('relation "public.document_versions" does not exist')) {
          console.log('Document versions table not found, using mock data');
          setVersions([]);
          return;
        }
        throw fetchError;
      }

      const typedVersions: DocumentVersion[] = ((data || []) as any[]).map((v: any) => ({
        ...v,
        // Derive major_version and minor_version from version_number if not present
        major_version: v.major_version ?? Math.floor(v.version_number) ?? 1,
        minor_version: v.minor_version ?? 0,
        change_type: (v.change_type as DocumentVersion['change_type']) || 'manual',
        is_current: v.is_current || (v.version_number === Math.max(...(data || []).map((d: any) => d.version_number))),
        tags: v.tags || [],
        metadata: (v.metadata as Record<string, unknown>) || {},
      }));

      setVersions(typedVersions);

      const current = typedVersions.find(v => v.is_current);
      if (current) {
        setCurrentVersion(current);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch versions';
      setError(message);
      console.error('Error fetching versions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  // Fetch branches
  const fetchBranches = useCallback(async () => {
    if (!documentId) return;

    try {
      // Check if version_branches table exists before querying
      const { data, error: fetchError } = await supabase
        .from('version_branches')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        // If the table doesn't exist (404), just set empty branches
        if (fetchError.code === 'PGRST116' || fetchError.message?.includes('relation "public.version_branches" does not exist')) {
          console.log('Error fetching branches:', fetchError);
          setBranches([]);
          return;
        }
        throw fetchError;
      }

      const typedBranches: VersionBranch[] = (data || []).map(b => ({
        ...b,
        status: (b.status as VersionBranch['status']) || 'active',
      }));

      setBranches(typedBranches);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  }, [documentId]);

  // Create a new version
  const createVersion = useCallback(async (params: CreateVersionParams): Promise<DocumentVersion> => {
    if (!user?.id) throw new Error('User not authenticated');

    // Get the latest version to determine version numbers
    const latestVersion = versions[0];
    let majorVersion = latestVersion?.major_version || 1;
    let minorVersion = (latestVersion?.minor_version || 0) + 1;

    if (params.is_major) {
      majorVersion += 1;
      minorVersion = 0;
    }

    const { data, error: insertError } = await (supabase
      .from('document_versions')
      .insert({
        document_id: params.document_id,
        content: params.content || {},
        file_url: params.file_url,
        file_size: params.file_size,
        file_hash: params.file_hash,
        change_summary: params.change_summary,
        change_type: params.change_type || 'manual',
        branch_id: params.branch_id || activeBranchId,
        parent_version_id: currentVersion?.id,
        tags: params.tags || [],
        major_version: majorVersion,
        minor_version: minorVersion,
        created_by: user.id,
        version_number: majorVersion * 100 + minorVersion,
      } as any)
      .select()
      .single());

    if (insertError) throw insertError;

    const newVersion: DocumentVersion = {
      ...(data as any),
      change_type: ((data as any).change_type as DocumentVersion['change_type']) || 'manual',
      is_current: true,
      tags: (data as any).tags || [],
      metadata: ((data as any).metadata as Record<string, unknown>) || {},
    };

    setVersions(prev => [newVersion, ...prev.map(v => ({ ...v, is_current: false }))]);
    setCurrentVersion(newVersion);

    toast.success(`Version ${majorVersion}.${minorVersion} created`);
    return newVersion;
  }, [user?.id, versions, currentVersion, activeBranchId]);

  // Restore a previous version
  const restoreVersion = useCallback(async (params: RestoreVersionParams): Promise<DocumentVersion> => {
    const versionToRestore = versions.find(v => v.id === params.version_id);
    if (!versionToRestore) throw new Error('Version not found');

    const newVersion = await createVersion({
      document_id: documentId,
      content: versionToRestore.content as Record<string, unknown>,
      file_url: versionToRestore.file_url,
      file_size: versionToRestore.file_size,
      file_hash: versionToRestore.file_hash,
      change_summary: params.restore_summary || `Restored from version ${versionToRestore.major_version}.${versionToRestore.minor_version}`,
      change_type: 'restore',
      parent_version_id: versionToRestore.id,
    });

    toast.success(`Restored to version ${versionToRestore.major_version}.${versionToRestore.minor_version}`);
    return newVersion;
  }, [versions, documentId, createVersion]);

  // Delete a version
  const deleteVersion = useCallback(async (versionId: string) => {
    const version = versions.find(v => v.id === versionId);
    if (version?.is_current) {
      throw new Error('Cannot delete the current version');
    }

    try {
      const { error: deleteError } = await supabase
        .from('document_versions')
        .delete()
        .eq('id', versionId);

      if (deleteError) {
        if (deleteError.code === 'PGRST116' || deleteError.message?.includes('relation "public.document_versions" does not exist')) {
          throw new Error('Document versions feature is not yet implemented in the database');
        }
        throw deleteError;
      }

      setVersions(prev => prev.filter(v => v.id !== versionId));
      toast.success('Version deleted');
    } catch (error) {
      console.error('Error deleting version:', error);
      throw error;
    }
  }, [versions]);

  // Create a branch
  const createBranch = useCallback(async (params: CreateBranchParams): Promise<VersionBranch> => {
    if (!user?.id) throw new Error('User not authenticated');

    try {
      const { data, error: insertError } = await supabase
        .from('version_branches')
        .insert({
          document_id: params.document_id,
          branch_name: params.branch_name,
          description: params.description,
          base_version_id: params.base_version_id,
          parent_branch_id: params.parent_branch_id,
          created_by: user.id,
          status: 'active',
        })
        .select()
        .single();

      if (insertError) {
        // If the table doesn't exist, return a mock branch
        if (insertError.code === 'PGRST116' || insertError.message?.includes('relation "public.version_branches" does not exist')) {
          throw new Error('Version branches feature is not yet implemented in the database');
        }
        throw insertError;
      }

      const newBranch: VersionBranch = {
        ...data,
        status: 'active',
      };

      setBranches(prev => [newBranch, ...prev]);
      toast.success(`Branch "${params.branch_name}" created`);
      return newBranch;
    } catch (error) {
      console.error('Error creating branch:', error);
      throw error;
    }
  }, [user?.id]);

  // Switch active branch
  const switchBranch = useCallback(async (branchId: string | null) => {
    setActiveBranchId(branchId);
    await fetchVersions();
  }, [fetchVersions]);

  // Compare two versions
  const compareVersions = useCallback(async (
    version1Id: string,
    version2Id: string
  ): Promise<VersionComparison> => {
    const v1 = versions.find(v => v.id === version1Id);
    const v2 = versions.find(v => v.id === version2Id);

    if (!v1 || !v2) throw new Error('One or both versions not found');

    // Fetch the actual document text for comparison
    // First, try to get from the documents table using the document_id
    const { data: doc1Data } = await supabase
      .from('documents')
      .select('extracted_text, file_name')
      .eq('id', v1.document_id)
      .single();

    const { data: doc2Data } = await supabase
      .from('documents')
      .select('extracted_text, file_name')
      .eq('id', v2.document_id)
      .single();

    // Get text content from a version - fetch from storage if content is a path
    const getTextContent = async (version: any, docData: any): Promise<string> => {
      const content = version.content;

      // Check if content looks like a storage path (contains / or matches UUID pattern)
      const isStoragePath = typeof content === 'string' &&
        (content.includes('/') || /^[a-f0-9-]+/.test(content)) &&
        !content.startsWith('{') && // Not JSON
        content.length < 500; // Paths should be short

      if (isStoragePath && typeof content === 'string') {
        try {
          // Content is a storage path - try to get the file and extract text
          const { data: urlData, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(content, 3600);

          if (urlError || !urlData?.signedUrl) {
            console.warn('Failed to get signed URL for version:', version.id, urlError);
            // Fallback to document's extracted_text if available
            if (docData?.extracted_text) {
              return docData.extracted_text;
            }
            return `[Unable to fetch file content]`;
          }

          // Fetch the file
          const response = await fetch(urlData.signedUrl);
          if (!response.ok) {
            console.warn('Failed to fetch document file:', response.status);
            if (docData?.extracted_text) {
              return docData.extracted_text;
            }
            return `[Failed to fetch document file]`;
          }

          const arrayBuffer = await response.arrayBuffer();

          // Check file type and extract text
          if (content.toLowerCase().endsWith('.docx')) {
            // Use mammoth to extract text from DOCX
            try {
              const mammoth = await import('mammoth');
              const result = await mammoth.extractRawText({ arrayBuffer });
              return result.value || '[No text content extracted from DOCX]';
            } catch (mammothError) {
              console.warn('Error extracting text with mammoth:', mammothError);
              if (docData?.extracted_text) {
                return docData.extracted_text;
              }
              return '[Unable to extract text from DOCX file]';
            }
          } else if (content.toLowerCase().endsWith('.pdf')) {
            // For PDF, use document's extracted text if available
            if (docData?.extracted_text) {
              return docData.extracted_text;
            }
            return '[PDF file - text extraction requires processing]';
          } else {
            // Try to read as text
            try {
              const text = new TextDecoder().decode(arrayBuffer);
              if (text && text.length > 0 && !text.includes('\x00')) {
                return text;
              }
            } catch {
              // Not a text file
            }
            if (docData?.extracted_text) {
              return docData.extracted_text;
            }
            return '[Binary file - cannot extract text]';
          }
        } catch (fetchError) {
          console.warn('Error fetching version content:', fetchError);
          if (docData?.extracted_text) {
            return docData.extracted_text;
          }
          return `[Error loading content from storage]`;
        }
      }

      // Content is not a storage path - try to use it directly
      if (typeof content === 'string' && content.length > 0) {
        // Check if it looks like actual text content (not a path)
        if (content.length > 100 || content.includes(' ')) {
          return content;
        }
      }

      if (content && typeof content === 'object') {
        // If it's an object with text property
        if ((content as any).text) {
          return String((content as any).text);
        }
        // Return JSON representation for other objects
        return JSON.stringify(content, null, 2);
      }

      // Fallback to document's extracted_text
      if (docData?.extracted_text) {
        return docData.extracted_text;
      }

      return '[No content available]';
    };

    const text1 = await getTextContent(v1, doc1Data);
    const text2 = await getTextContent(v2, doc2Data);


    // Perform line-by-line comparison
    const diffs: VersionDiff[] = [];
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');

    let addedCount = 0, removedCount = 0, modifiedCount = 0, unchangedCount = 0;

    // Use LCS (Longest Common Subsequence) based diff algorithm
    const maxLen = Math.max(lines1.length, lines2.length);
    const minLen = Math.min(lines1.length, lines2.length);

    // Track which lines from each document have been matched
    const matched1 = new Set<number>();
    const matched2 = new Set<number>();

    // First pass: find exact matches
    for (let i = 0; i < lines1.length; i++) {
      for (let j = 0; j < lines2.length; j++) {
        if (!matched2.has(j) && lines1[i].trim() === lines2[j].trim() && lines1[i].trim()) {
          matched1.add(i);
          matched2.add(j);
          diffs.push({
            type: 'unchanged',
            path: `line ${i + 1}`,
            oldValue: lines1[i],
            newValue: lines2[j],
          });
          unchangedCount++;
          break;
        }
      }
    }

    // Second pass: identify removed lines (in v1 but not matched in v2)
    for (let i = 0; i < lines1.length; i++) {
      if (!matched1.has(i) && lines1[i].trim()) {
        // Check if there's a similar line in v2 (modified)
        let foundSimilar = false;
        for (let j = 0; j < lines2.length; j++) {
          if (!matched2.has(j) && lines2[j].trim()) {
            // Check for similarity (first few words match or significant overlap)
            const words1 = lines1[i].toLowerCase().split(/\s+/).slice(0, 5).join(' ');
            const words2 = lines2[j].toLowerCase().split(/\s+/).slice(0, 5).join(' ');

            if (words1.length > 10 && words2.length > 10 &&
              (words1.includes(words2.substring(0, 20)) || words2.includes(words1.substring(0, 20)))) {
              matched1.add(i);
              matched2.add(j);
              diffs.push({
                type: 'modified',
                path: `line ${i + 1}`,
                oldValue: lines1[i],
                newValue: lines2[j],
              });
              modifiedCount++;
              foundSimilar = true;
              break;
            }
          }
        }

        if (!foundSimilar) {
          matched1.add(i);
          diffs.push({
            type: 'removed',
            path: `line ${i + 1}`,
            oldValue: lines1[i],
          });
          removedCount++;
        }
      }
    }

    // Third pass: identify added lines (in v2 but not matched)
    for (let j = 0; j < lines2.length; j++) {
      if (!matched2.has(j) && lines2[j].trim()) {
        matched2.add(j);
        diffs.push({
          type: 'added',
          path: `line ${j + 1}`,
          newValue: lines2[j],
        });
        addedCount++;
      }
    }

    // Sort diffs by line number
    diffs.sort((a, b) => {
      const lineA = parseInt(a.path.replace('line ', '')) || 0;
      const lineB = parseInt(b.path.replace('line ', '')) || 0;
      return lineA - lineB;
    });

    // If no content changes found, but texts are different, show as single modified block
    if (diffs.length === 0 && text1 !== text2) {
      diffs.push({
        type: 'modified',
        path: 'content',
        oldValue: text1 || '(empty)',
        newValue: text2 || '(empty)',
      });
      modifiedCount = 1;
    }

    // If both texts are empty or identical
    if (diffs.length === 0 && text1 === text2) {
      diffs.push({
        type: 'unchanged',
        path: 'content',
        oldValue: text1 || '(no content)',
        newValue: text2 || '(no content)',
      });
      unchangedCount = 1;
    }

    const summary = {
      added: addedCount,
      removed: removedCount,
      modified: modifiedCount,
      unchanged: unchangedCount,
    };

    return {
      baseVersion: v1,
      compareVersion: v2,
      diffs,
      summary,
    };
  }, [versions]);


  // Add comment to a version
  const addComment = useCallback(async (versionId: string, comment: string): Promise<VersionComment> => {
    if (!user?.id) throw new Error('User not authenticated');

    const { data, error: insertError } = await supabase
      .from('version_comments')
      .insert({
        version_id: versionId,
        user_id: user.id,
        comment,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    toast.success('Comment added');
    return data as VersionComment;
  }, [user?.id]);

  // Get comments for a version
  const getVersionComments = useCallback(async (versionId: string): Promise<VersionComment[]> => {
    const { data, error: fetchError } = await supabase
      .from('version_comments')
      .select('*')
      .eq('version_id', versionId)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    return (data || []) as VersionComment[];
  }, []);

  // Initial fetch
  useEffect(() => {
    if (documentId) {
      fetchVersions();
      fetchBranches();
    }
  }, [documentId, fetchVersions, fetchBranches]);

  // Real-time subscription for version updates
  useEffect(() => {
    if (!documentId || !autoRefresh) return;

    const channel = supabase
      .channel(`versions-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_versions',
          filter: `document_id=eq.${documentId}`,
        },
        () => {
          fetchVersions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, autoRefresh, fetchVersions]);

  return {
    versions,
    branches,
    currentVersion,
    activeBranchId,
    isLoading,
    error,
    createVersion,
    restoreVersion,
    deleteVersion,
    createBranch,
    switchBranch,
    compareVersions,
    addComment,
    getVersionComments,
    refreshVersions: fetchVersions,
    refreshBranches: fetchBranches,
  };
}
