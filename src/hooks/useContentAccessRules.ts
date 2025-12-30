import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContentAccessRule {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  file_types?: string[];
  name_patterns?: string[];
  content_keywords?: string[];
  metadata_conditions?: Record<string, any>;
  folder_ids?: string[];
  tag_ids?: string[];
  size_min_bytes?: number;
  size_max_bytes?: number;
  auto_apply_permission?: 'owner' | 'editor' | 'commenter' | 'viewer' | 'none';
  auto_share_with?: string[];
  auto_share_permission?: 'view' | 'comment' | 'download' | 'edit';
  auto_apply_tags?: string[];
  auto_move_to_folder?: string;
  require_approval?: boolean;
  approval_users?: string[];
  restrict_download?: boolean;
  restrict_print?: boolean;
  restrict_share?: boolean;
  restrict_external_share?: boolean;
  watermark_required?: boolean;
  notify_on_match?: boolean;
  notify_users?: string[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface RuleApplication {
  id: string;
  rule_id: string;
  document_id: string;
  matched_criteria: Record<string, any>;
  actions_applied: Record<string, any>;
  applied_by?: string;
  created_at: string;
}

export interface CreateRuleParams {
  name: string;
  description?: string;
  file_types?: string[];
  name_patterns?: string[];
  content_keywords?: string[];
  folder_ids?: string[];
  size_min_bytes?: number;
  size_max_bytes?: number;
  auto_apply_permission?: ContentAccessRule['auto_apply_permission'];
  auto_apply_tags?: string[];
  auto_move_to_folder?: string;
  restrict_download?: boolean;
  restrict_print?: boolean;
  restrict_share?: boolean;
  restrict_external_share?: boolean;
  watermark_required?: boolean;
  notify_on_match?: boolean;
  is_active?: boolean;
  priority?: number;
  document_ids?: string[];
}

export function useContentAccessRules() {
  const [rules, setRules] = useState<ContentAccessRule[]>([]);
  const [applications, setApplications] = useState<RuleApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/rules/', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch rules');

      const data = await response.json();
      setRules(data || []);
    } catch (error) {
      console.error('Error fetching content access rules:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createRule = useCallback(async (params: CreateRuleParams): Promise<ContentAccessRule | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      // Extract document_ids but don't send to backend
      const { document_ids, ...ruleParams } = params;

      const response = await fetch('/api/rules/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(ruleParams)
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create rule';
        try {
          const text = await response.text();
          try {
            const err = JSON.parse(text);
            errorMessage = err.detail || errorMessage;
          } catch {
            if (text) errorMessage = text;
          }
        } catch (e) {
          console.error("Error reading error response", e);
        }
        throw new Error(`[${response.status} ${response.statusText}] ${errorMessage}`);
      }

      const newRule = await response.json() as ContentAccessRule;

      // Apply restrictions to selected documents
      if (document_ids && document_ids.length > 0) {
        console.log('[Rules] Applying to document_ids:', document_ids);

        const { data: docs, error: fetchError } = await supabase
          .from('documents')
          .select('id, file_name, file_type, file_size, extracted_text')
          .in('id', document_ids);

        console.log('[Rules] Fetched docs:', docs?.length, 'Error:', fetchError);

        if (docs) {
          for (const doc of docs) {
            console.log('[Rules] Checking doc:', doc.file_name, 'type:', doc.file_type);

            // Inline matching logic
            const hasCriteria =
              (ruleParams.file_types?.length || 0) > 0 ||
              (ruleParams.name_patterns?.length || 0) > 0 ||
              (ruleParams.content_keywords?.length || 0) > 0;

            console.log('[Rules] hasCriteria:', hasCriteria, 'file_types:', ruleParams.file_types, 'name_patterns:', ruleParams.name_patterns);

            let ruleMatched = !hasCriteria; // No criteria = apply to all

            if (hasCriteria) {
              // Check file type
              if (ruleParams.file_types?.length) {
                ruleMatched = ruleParams.file_types.some(t =>
                  doc.file_type?.toLowerCase().includes(t.toLowerCase())
                );
                console.log('[Rules] File type match:', ruleMatched);
              }
              // Check name patterns
              if (!ruleMatched && ruleParams.name_patterns?.length) {
                ruleMatched = ruleParams.name_patterns.some(p => {
                  try { return new RegExp(p, 'i').test(doc.file_name || ''); }
                  catch { return false; }
                });
                console.log('[Rules] Name pattern match:', ruleMatched);
              }
              // Check keywords
              if (!ruleMatched && ruleParams.content_keywords?.length) {
                const text = doc.extracted_text || '';
                ruleMatched = ruleParams.content_keywords.some(k =>
                  text.toLowerCase().includes(k.toLowerCase())
                );
                console.log('[Rules] Keyword match:', ruleMatched, 'text length:', text.length);
              }
            }

            console.log('[Rules] Final ruleMatched:', ruleMatched);

            if (ruleMatched) {
              const { error: insertError } = await supabase.from('content_rule_applications').insert({
                rule_id: newRule.id,
                document_id: doc.id,
                matched_criteria: { match_source: 'manual-selection' },
                actions_applied: {
                  restrict_download: newRule.restrict_download,
                  restrict_print: newRule.restrict_print,
                  restrict_share: newRule.restrict_share,
                  restrict_external_share: newRule.restrict_external_share,
                  watermark_required: newRule.watermark_required,
                  notify_on_match: newRule.notify_on_match
                }
              });
              console.log('[Rules] Insert result - Error:', insertError);
            }
          }
        }
      }

      // Get matched count from applications table  
      await new Promise(resolve => setTimeout(resolve, 600));
      const { count } = await supabase
        .from('content_rule_applications')
        .select('*', { count: 'exact', head: true })
        .eq('rule_id', newRule.id);

      const matchedCount = count || 0;

      toast({
        title: "Rule created",
        description: `Access rule "${params.name}" created successfully. Auto-matched ${matchedCount} document(s).`,
      });

      await fetchRules();
      return newRule;
    } catch (error: any) {
      toast({
        title: "Error creating rule",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  }, [toast, fetchRules]);

  const updateRule = useCallback(async (ruleId: string, updates: Partial<ContentAccessRule>) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(`/api/rules/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) throw new Error('Failed to update rule');

      toast({
        title: "Rule updated",
        description: "Content access rule has been updated.",
      });

      await fetchRules();
    } catch (error: any) {
      toast({
        title: "Error updating rule",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [toast, fetchRules]);

  const deleteRule = useCallback(async (ruleId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(`/api/rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete rule');

      toast({
        title: "Rule deleted",
        description: "Content access rule has been removed.",
      });

      await fetchRules();
    } catch (error: any) {
      toast({
        title: "Error deleting rule",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [toast, fetchRules]);

  const toggleRule = useCallback(async (ruleId: string, isActive: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(`/api/rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ is_active: isActive })
      });

      if (!response.ok) throw new Error('Failed to toggle rule');

      const result = await response.json();

      toast({
        title: isActive ? "Rule Enabled" : "Rule Disabled",
        description: result.message || (isActive
          ? `Rule applied to ${result.matched_count || 0} document(s)`
          : `Rule removed from ${result.removed_count || 0} document(s)`),
      });

      await fetchRules();
    } catch (error: any) {
      toast({
        title: "Error toggling rule",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [toast, fetchRules]);

  const reorderRules = useCallback(async (ruleIds: string[]) => {
    try {
      const updates = ruleIds.map((id, index) => updateRule(id, { priority: index + 1 }));
      await Promise.all(updates);
    } catch (error) {
      console.error("Failed to reorder rules", error);
    }
  }, [updateRule]);

  const fetchApplications = useCallback(async (params?: { ruleId?: string; documentId?: string }) => {
    try {
      console.log('[Rules] fetchApplications called with params:', params);

      let query = supabase
        .from('content_rule_applications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (params?.ruleId) {
        query = query.eq('rule_id', params.ruleId) as any;
      }

      if (params?.documentId) {
        query = query.eq('document_id', params.documentId) as any;
      }

      const { data, error } = await query;

      console.log('[Rules] fetchApplications result:', data?.length, 'applications, error:', error);

      if (error) throw error;

      // Manually fetch document info for each application
      if (data && data.length > 0) {
        const docIds = data.map(app => app.document_id).filter(Boolean);
        const { data: docs } = await supabase
          .from('documents')
          .select('id, file_name')
          .in('id', docIds);

        // Join manually
        const enrichedData = data.map(app => ({
          ...app,
          document: docs?.find(d => d.id === app.document_id)
        }));

        console.log('[Rules] Enriched with documents:', enrichedData);
        setApplications(enrichedData as any);
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error('Error fetching rule applications:', error);
      setApplications([]);
    }
  }, []);

  const evaluateDocument = useCallback(async (documentId: string, documentData: {
    name?: string;
    file_type?: string;
    file_size?: number;
    folder_id?: string;
    tags?: string[];
    content?: string;
  }): Promise<ContentAccessRule[]> => {
    const matchedRules: ContentAccessRule[] = [];

    for (const rule of rules) {
      if (!rule.is_active) continue;

      let isMatch = true;

      // Check file types (AND logic - if rule has types, doc must match one)
      if (rule.file_types?.length && rule.file_types.length > 0) {
        const typeMatch = documentData.file_type && rule.file_types.some(t =>
          documentData.file_type?.toLowerCase().includes(t.toLowerCase())
        );
        if (!typeMatch) isMatch = false;
      }

      // Check name patterns (AND logic)
      if (isMatch && rule.name_patterns?.length && rule.name_patterns.length > 0) {
        const nameMatch = documentData.name && rule.name_patterns.some(pattern => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(documentData.name || '');
          } catch (e) {
            return false;
          }
        });
        if (!nameMatch) isMatch = false;
      }

      // Check content keywords (AND logic)
      if (isMatch && rule.content_keywords?.length && rule.content_keywords.length > 0) {
        const contentMatch = documentData.content && rule.content_keywords.some(keyword =>
          documentData.content?.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!contentMatch) isMatch = false;
      }

      // Check folder (AND logic)
      if (isMatch && rule.folder_ids?.length && rule.folder_ids.length > 0) {
        const folderMatch = documentData.folder_id && rule.folder_ids.includes(documentData.folder_id);
        if (!folderMatch) isMatch = false;
      }

      // Check size range (AND logic)
      if (isMatch && (rule.size_min_bytes || rule.size_max_bytes) && documentData.file_size !== undefined) {
        const sizeMatch =
          (!rule.size_min_bytes || documentData.file_size >= rule.size_min_bytes) &&
          (!rule.size_max_bytes || documentData.file_size <= rule.size_max_bytes);
        if (!sizeMatch) isMatch = false;
      }

      // Special case: If rule has NO criteria at all, it shouldn't match everything automatically unless intended.
      // Usually "Empty Rule" matches nothing or everything. Let's assume matches nothing if no criteria defined to be safe.
      const hasCriteria =
        (rule.file_types?.length || 0) > 0 ||
        (rule.name_patterns?.length || 0) > 0 ||
        (rule.content_keywords?.length || 0) > 0 ||
        (rule.folder_ids?.length || 0) > 0 ||
        (rule.size_min_bytes || rule.size_max_bytes);

      if (isMatch && hasCriteria) {
        matchedRules.push(rule);
      }
    }

    return matchedRules.sort((a, b) => a.priority - b.priority);
  }, [rules]);

  const applyRulesToDocument = useCallback(async (documentId: string, documentData: Parameters<typeof evaluateDocument>[1]) => {
    const matchedRules = await evaluateDocument(documentId, documentData);

    // Always clean up old applications first to avoid duplicates or stale rules
    await supabase.from('content_rule_applications').delete().eq('document_id', documentId);

    if (matchedRules.length === 0) return [];

    const applications = matchedRules.map(rule => ({
      rule_id: rule.id,
      document_id: documentId,
      matched_criteria: {
        match_source: 'auto-evaluation'
      },
      actions_applied: {
        restrict_download: rule.restrict_download,
        restrict_print: rule.restrict_print,
        restrict_share: rule.restrict_share,
        restrict_external_share: rule.restrict_external_share,
        watermark_required: rule.watermark_required,
        notify_on_match: rule.notify_on_match
      }
    }));

    const { error } = await supabase
      .from('content_rule_applications')
      .insert(applications);

    if (error) {
      console.error("Failed to save rule applications", error);
      toast({ title: "Rule Application Failed", description: error.message, variant: "destructive" });
    } else {
      // If there are matches and notify_on_match is true, we could trigger notifications here
      // For now just console log
      console.log(`Applied ${matchedRules.length} rules to document ${documentId}`);
    }

    return matchedRules;
  }, [evaluateDocument, toast]);

  // Use a ref or state for stats to be persistent/async
  const [stats, setStats] = useState({ total: 0, active: 0, withRestrictions: 0, withAutoActions: 0 });

  const fetchStats = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/rules/stats', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [rules, fetchStats]); // Refresh stats when rules change

  const getRuleStats = useCallback(() => {
    return stats;
  }, [stats]);


  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return {
    rules,
    applications,
    loading,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    reorderRules,
    fetchApplications,
    evaluateDocument,
    applyRulesToDocument,
    getRuleStats,
    refetch: fetchRules,
  };
}
