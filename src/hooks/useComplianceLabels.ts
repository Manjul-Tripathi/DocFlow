import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  ComplianceLabel, 
  DocumentComplianceLabel, 
  ComplianceAuditEntry,
  ComplianceViolation,
  ComplianceStats,
  ComplianceFramework
} from '@/types/compliance';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface UseComplianceLabelsOptions {
  documentId?: string;
  autoFetch?: boolean;
}

const defaultStats: ComplianceStats = {
  total_labels: 0,
  active_labels: 0,
  labeled_documents: 0,
  unlabeled_documents: 0,
  pending_reviews: 0,
  active_violations: 0,
  resolved_violations: 0,
  labels_by_framework: {
    GDPR: 0,
    HIPAA: 0,
    SOX: 0,
    PCI_DSS: 0,
    CCPA: 0,
    FERPA: 0,
    ISO_27001: 0,
    NIST: 0,
    SOC2: 0,
    CUSTOM: 0
  },
  labels_by_classification: {
    public: 0,
    internal: 0,
    confidential: 0,
    highly_confidential: 0,
    restricted: 0
  },
  recent_activity_count: 0
};

export const useComplianceLabels = (options: UseComplianceLabelsOptions = {}) => {
  const { autoFetch = true, documentId } = options;
  const { user } = useAuth();
  
  const [labels, setLabels] = useState<ComplianceLabel[]>([]);
  const [documentLabels, setDocumentLabels] = useState<DocumentComplianceLabel[]>([]);
  const [auditEntries, setAuditEntries] = useState<ComplianceAuditEntry[]>([]);
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<ComplianceStats>(defaultStats);

  // Fetch all compliance labels from database
  const fetchLabels = useCallback(async (framework?: ComplianceFramework) => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('compliance_labels')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (framework) {
        query = query.eq('framework', framework);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLabels(data || []);
    } catch (error) {
      console.error('Error fetching labels:', error);
      toast.error('Failed to fetch compliance labels');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch compliance statistics
  const fetchStats = useCallback(async () => {
    try {
      // Get total and active labels count
      const { data: labelsData } = await supabase
        .from('compliance_labels')
        .select('id, is_active, framework, data_classification');

      const totalLabels = labelsData?.length || 0;
      const activeLabels = labelsData?.filter(l => l.is_active).length || 0;

      // Get labeled documents count (unique document_ids with active labels)
      const { data: labeledDocsData } = await supabase
        .from('document_compliance_labels')
        .select('document_id')
        .eq('status', 'active');

      const uniqueLabeledDocs = new Set(labeledDocsData?.map(d => d.document_id) || []);
      const labeledDocsCount = uniqueLabeledDocs.size;

      // Get total documents count
      const { count: totalDocsCount } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null);

      // Get pending reviews (due within 7 days)
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      
      const { count: pendingReviewsCount } = await supabase
        .from('document_compliance_labels')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .lte('next_review_date', sevenDaysFromNow.toISOString());

      // Get active violations
      const { count: activeViolationsCount } = await supabase
        .from('compliance_violations')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', false);

      // Get resolved violations this month
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: resolvedViolationsCount } = await supabase
        .from('compliance_violations')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', true)
        .gte('resolved_at', thirtyDaysAgo.toISOString());

      // Get documents count by framework
      const { data: frameworkData } = await supabase
        .from('document_compliance_labels')
        .select(`
          label_id,
          compliance_labels!inner(framework)
        `)
        .eq('status', 'active');

      const labelsByFramework: Record<string, number> = {
        GDPR: 0, HIPAA: 0, SOX: 0, PCI_DSS: 0, CCPA: 0,
        FERPA: 0, ISO_27001: 0, NIST: 0, SOC2: 0, CUSTOM: 0
      };

      frameworkData?.forEach((item: any) => {
        const framework = item.compliance_labels?.framework;
        if (framework && labelsByFramework.hasOwnProperty(framework)) {
          labelsByFramework[framework]++;
        }
      });

      // Get documents count by classification
      const { data: classificationData } = await supabase
        .from('document_compliance_labels')
        .select(`
          label_id,
          compliance_labels!inner(data_classification)
        `)
        .eq('status', 'active');

      const labelsByClassification: Record<string, number> = {
        public: 0, internal: 0, confidential: 0, 
        highly_confidential: 0, restricted: 0
      };

      classificationData?.forEach((item: any) => {
        const classification = item.compliance_labels?.data_classification;
        if (classification && labelsByClassification.hasOwnProperty(classification)) {
          labelsByClassification[classification]++;
        }
      });

      // Get recent activity count (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const { count: recentActivityCount } = await supabase
        .from('compliance_audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('performed_at', oneDayAgo.toISOString());

      // Calculate compliance score
      const totalDocs = totalDocsCount || 0;
      const complianceScore = totalDocs > 0 
        ? Math.round((labeledDocsCount / totalDocs) * 100) 
        : 0;

      setStats({
        total_labels: totalLabels,
        active_labels: activeLabels,
        labeled_documents: labeledDocsCount,
        unlabeled_documents: Math.max(0, totalDocs - labeledDocsCount),
        pending_reviews: pendingReviewsCount || 0,
        active_violations: activeViolationsCount || 0,
        resolved_violations: resolvedViolationsCount || 0,
        labels_by_framework: labelsByFramework as any,
        labels_by_classification: labelsByClassification as any,
        recent_activity_count: recentActivityCount || 0
      });

    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  // Fetch violations
  const fetchViolations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('compliance_violations')
        .select(`
          *,
          compliance_labels(name, color, framework)
        `)
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      setViolations(data?.map(v => ({
        ...v,
        label_name: v.compliance_labels?.name,
        label_color: v.compliance_labels?.color,
        framework: v.compliance_labels?.framework
      })) || []);
    } catch (error) {
      console.error('Error fetching violations:', error);
    }
  }, []);

  // Fetch audit entries
  const fetchAuditEntries = useCallback(async (limit = 50) => {
    try {
      const { data, error } = await supabase
        .from('compliance_audit_log')
        .select(`
          *,
          compliance_labels(name, color)
        `)
        .order('performed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      setAuditEntries(data?.map(e => ({
        ...e,
        performed_by: e.performed_by_name || e.performed_by_email || 'System',
        label_name: e.compliance_labels?.name,
        label_color: e.compliance_labels?.color
      })) || []);
    } catch (error) {
      console.error('Error fetching audit entries:', error);
    }
  }, []);

  // Create a new compliance label
  const createLabel = useCallback(async (label: Omit<ComplianceLabel, 'id' | 'created_at' | 'updated_at'>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('compliance_labels')
        .insert({
          ...label,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        label_id: data.id,
        action: 'label_created',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Created compliance label: ${label.name}`
      });

      setLabels(prev => [...prev, data]);
      toast.success('Compliance label created successfully');
      await fetchStats();
      return data;
    } catch (error: any) {
      console.error('Error creating label:', error);
      toast.error(error.message || 'Failed to create compliance label');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, fetchStats]);

  // Update an existing compliance label
  const updateLabel = useCallback(async (id: string, updates: Partial<ComplianceLabel>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('compliance_labels')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        label_id: id,
        action: 'label_updated',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Updated compliance label: ${data.name}`
      });

      setLabels(prev => prev.map(l => l.id === id ? data : l));
      toast.success('Compliance label updated');
      return data;
    } catch (error: any) {
      console.error('Error updating label:', error);
      toast.error(error.message || 'Failed to update compliance label');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Delete a compliance label
  const deleteLabel = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const label = labels.find(l => l.id === id);
      
      const { error } = await supabase
        .from('compliance_labels')
        .delete()
        .eq('id', id)
        .eq('is_system_label', false); // Can't delete system labels

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        label_id: id,
        action: 'label_deleted',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Deleted compliance label: ${label?.name}`
      });

      setLabels(prev => prev.filter(l => l.id !== id));
      toast.success('Compliance label deleted');
      await fetchStats();
    } catch (error: any) {
      console.error('Error deleting label:', error);
      toast.error(error.message || 'Failed to delete compliance label');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, labels, fetchStats]);

  // Apply a label to a document
  const applyLabel = useCallback(async (
    docId: string, 
    labelId: string, 
    justification?: string
  ) => {
    setIsLoading(true);
    try {
      const label = labels.find(l => l.id === labelId);
      if (!label) throw new Error('Label not found');

      const reviewDate = new Date();
      reviewDate.setDate(reviewDate.getDate() + (label.audit_frequency_days || 90));

      const { data, error } = await supabase
        .from('document_compliance_labels')
        .upsert({
          document_id: docId,
          label_id: labelId,
          applied_by: user?.id,
          justification,
          status: 'active',
          next_review_date: reviewDate.toISOString()
        }, {
          onConflict: 'document_id,label_id'
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        document_id: docId,
        label_id: labelId,
        action: 'applied',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Applied ${label.name} label to document`
      });

      toast.success(`Applied ${label.name} label`);
      await fetchStats();
      return data;
    } catch (error: any) {
      console.error('Error applying label:', error);
      toast.error(error.message || 'Failed to apply label');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, labels, fetchStats]);

  // Remove a label from a document
  const removeLabel = useCallback(async (documentLabelId: string, reason?: string) => {
    setIsLoading(true);
    try {
      const { data: docLabel, error: fetchError } = await supabase
        .from('document_compliance_labels')
        .select('*, compliance_labels(name)')
        .eq('id', documentLabelId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('document_compliance_labels')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', documentLabelId);

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        document_id: docLabel.document_id,
        label_id: docLabel.label_id,
        action: 'removed',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Removed ${docLabel.compliance_labels?.name} label${reason ? `: ${reason}` : ''}`
      });

      setDocumentLabels(prev => prev.filter(dl => dl.id !== documentLabelId));
      toast.success('Label removed from document');
      await fetchStats();
    } catch (error: any) {
      console.error('Error removing label:', error);
      toast.error(error.message || 'Failed to remove label');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, fetchStats]);

  // Acknowledge a compliance label
  const acknowledgeLabel = useCallback(async (documentLabelId: string) => {
    setIsLoading(true);
    try {
      const { data: docLabel } = await supabase
        .from('document_compliance_labels')
        .select('*, compliance_labels(name, acknowledgment_text)')
        .eq('id', documentLabelId)
        .single();

      const { error } = await supabase
        .from('compliance_acknowledgments')
        .insert({
          document_compliance_id: documentLabelId,
          user_id: user?.id,
          user_email: user?.email,
          user_name: user?.user_metadata?.full_name,
          acknowledgment_text: docLabel?.compliance_labels?.acknowledgment_text || 'Acknowledged'
        });

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        document_id: docLabel?.document_id,
        label_id: docLabel?.label_id,
        document_compliance_id: documentLabelId,
        action: 'acknowledged',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Acknowledged ${docLabel?.compliance_labels?.name} compliance requirements`
      });

      toast.success('Acknowledgment recorded');
    } catch (error: any) {
      console.error('Error acknowledging label:', error);
      toast.error(error.message || 'Failed to record acknowledgment');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Resolve a violation
  const resolveViolation = useCallback(async (violationId: string, notes: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('compliance_violations')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', violationId)
        .select('*, compliance_labels(name)')
        .single();

      if (error) throw error;

      // Log audit entry
      await supabase.from('compliance_audit_log').insert({
        document_id: data.document_id,
        label_id: data.label_id,
        action: 'violation',
        performed_by: user?.id,
        performed_by_email: user?.email,
        performed_by_name: user?.user_metadata?.full_name,
        details: `Resolved ${data.violation_type} violation: ${notes}`
      });

      setViolations(prev => prev.map(v => 
        v.id === violationId 
          ? { ...v, resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id, resolution_notes: notes }
          : v
      ));
      
      toast.success('Violation resolved');
      await fetchStats();
    } catch (error: any) {
      console.error('Error resolving violation:', error);
      toast.error(error.message || 'Failed to resolve violation');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, fetchStats]);

  // Get audit trail for a specific document or label
  const getAuditTrail = useCallback(async (docId?: string, labelId?: string) => {
    try {
      let query = supabase
        .from('compliance_audit_log')
        .select('*, compliance_labels(name, color)')
        .order('performed_at', { ascending: false })
        .limit(100);

      if (docId) {
        query = query.eq('document_id', docId);
      }
      if (labelId) {
        query = query.eq('label_id', labelId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data?.map(e => ({
        ...e,
        performed_by: e.performed_by_name || e.performed_by_email || 'System',
        label_name: e.compliance_labels?.name,
        label_color: e.compliance_labels?.color
      })) || [];
    } catch (error) {
      console.error('Error fetching audit trail:', error);
      return [];
    }
  }, []);

  // Generate compliance report
  const generateReport = useCallback(async (
    reportType: 'summary' | 'detailed' | 'violations' | 'audit_trail' | 'data_mapping',
    options?: {
      framework?: ComplianceFramework;
      startDate?: Date;
      endDate?: Date;
    }
  ) => {
    setIsLoading(true);
    try {
      // Build report data structure
      const reportData: Record<string, any> = {
        generated_at: new Date().toISOString(),
        generated_by: user?.email || 'System',
        type: reportType,
        framework_filter: options?.framework || 'All',
        period: {
          start: options?.startDate?.toISOString() || null,
          end: options?.endDate?.toISOString() || null
        },
        stats: { ...stats }
      };

      // Summary Report - Overall compliance status
      if (reportType === 'summary' || reportType === 'detailed') {
        reportData.labels = labels.map(l => ({
          name: l.name,
          framework: l.framework,
          classification: l.data_classification,
          retention_days: l.retention_period_days,
          is_active: l.is_active
        }));
        
        reportData.violations_summary = {
          active: violations.filter(v => !v.resolved).length,
          resolved: violations.filter(v => v.resolved).length,
          total: violations.length
        };

        // Get document counts by label
        const { data: docLabelCounts } = await supabase
          .from('document_compliance_labels')
          .select('label_id, compliance_labels(name, framework)')
          .eq('status', 'active');

        const labelCounts: Record<string, number> = {};
        docLabelCounts?.forEach((dl: any) => {
          const name = dl.compliance_labels?.name;
          if (name) {
            labelCounts[name] = (labelCounts[name] || 0) + 1;
          }
        });
        reportData.documents_by_label = labelCounts;

        // Framework distribution
        reportData.framework_distribution = stats.labels_by_framework;
        reportData.classification_distribution = stats.labels_by_classification;
      }

      // Data Mapping Report - Shows data classification and sensitivity
      if (reportType === 'data_mapping') {
        const { data: mappingData } = await supabase
          .from('document_compliance_labels')
          .select(`
            document_id,
            applied_at,
            compliance_labels!inner(
              name,
              framework,
              data_classification,
              retention_period_days,
              auto_classification
            ),
            documents!inner(
              title,
              file_type,
              created_at
            )
          `)
          .eq('status', 'active');

        reportData.data_mappings = mappingData?.map((dm: any) => ({
          document_title: dm.documents?.title,
          file_type: dm.documents?.file_type,
          label_name: dm.compliance_labels?.name,
          framework: dm.compliance_labels?.framework,
          classification: dm.compliance_labels?.data_classification,
          retention_days: dm.compliance_labels?.retention_period_days,
          auto_classified: dm.compliance_labels?.auto_classification,
          labeled_date: dm.applied_at,
          document_created: dm.documents?.created_at
        })) || [];

        // Classification summary
        const classificationCounts: Record<string, number> = {};
        reportData.data_mappings.forEach((m: any) => {
          const cls = m.classification || 'unclassified';
          classificationCounts[cls] = (classificationCounts[cls] || 0) + 1;
        });
        reportData.classification_summary = classificationCounts;
      }

      // Violations Report
      if (reportType === 'violations') {
        let filteredViolations = violations;
        
        if (options?.framework) {
          const frameworkLabelIds = labels
            .filter(l => l.framework === options.framework)
            .map(l => l.id);
          filteredViolations = violations.filter(v => 
            frameworkLabelIds.includes(v.label_id)
          );
        }

        if (options?.startDate) {
          filteredViolations = filteredViolations.filter(v => 
            new Date(v.detected_at) >= options.startDate!
          );
        }

        if (options?.endDate) {
          filteredViolations = filteredViolations.filter(v => 
            new Date(v.detected_at) <= options.endDate!
          );
        }

        reportData.violations = filteredViolations.map(v => {
          const label = labels.find(l => l.id === v.label_id);
          return {
            ...v,
            label_name: label?.name,
            framework: label?.framework
          };
        });

        reportData.violations_by_severity = {
          critical: filteredViolations.filter(v => v.severity === 'critical').length,
          high: filteredViolations.filter(v => v.severity === 'high').length,
          medium: filteredViolations.filter(v => v.severity === 'medium').length,
          low: filteredViolations.filter(v => v.severity === 'low').length
        };
      }

      // Audit Trail Report
      if (reportType === 'audit_trail') {
        let auditQuery = supabase
          .from('compliance_audit_log')
          .select(`
            *,
            compliance_labels(name, framework),
            documents(title)
          `)
          .order('performed_at', { ascending: false });

        if (options?.startDate) {
          auditQuery = auditQuery.gte('performed_at', options.startDate.toISOString());
        }
        if (options?.endDate) {
          auditQuery = auditQuery.lte('performed_at', options.endDate.toISOString());
        }

        const { data: auditData } = await auditQuery;

        let filteredAudit = auditData || [];
        if (options?.framework) {
          filteredAudit = filteredAudit.filter((a: any) => 
            a.compliance_labels?.framework === options.framework
          );
        }

        reportData.audit_entries = filteredAudit.map((a: any) => ({
          action: a.action,
          performed_at: a.performed_at,
          performed_by: a.performed_by_name || a.performed_by_email || 'System',
          document_title: a.documents?.title,
          label_name: a.compliance_labels?.name,
          framework: a.compliance_labels?.framework,
          changes: a.changes,
          details: a.details
        }));

        // Action summary
        const actionCounts: Record<string, number> = {};
        reportData.audit_entries.forEach((a: any) => {
          actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
        });
        reportData.action_summary = actionCounts;
      }

      toast.success(`${reportType.replace('_', ' ')} report generated`);
      return reportData;
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [labels, violations, stats, user]);

  // Get document labels
  const fetchDocumentLabels = useCallback(async (docId: string) => {
    try {
      const { data, error } = await supabase
        .from('document_compliance_labels')
        .select(`
          *,
          compliance_labels(*),
          compliance_acknowledgments(*)
        `)
        .eq('document_id', docId)
        .eq('status', 'active');

      if (error) throw error;

      setDocumentLabels(data?.map(dl => ({
        ...dl,
        label: dl.compliance_labels,
        acknowledgments: dl.compliance_acknowledgments || []
      })) || []);
    } catch (error) {
      console.error('Error fetching document labels:', error);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchLabels();
      fetchStats();
      fetchViolations();
      fetchAuditEntries();
    }
  }, [autoFetch, fetchLabels, fetchStats, fetchViolations, fetchAuditEntries]);

  // Fetch document labels when documentId changes
  useEffect(() => {
    if (documentId) {
      fetchDocumentLabels(documentId);
    }
  }, [documentId, fetchDocumentLabels]);

  return {
    labels,
    documentLabels,
    auditEntries,
    violations,
    stats,
    isLoading,
    fetchLabels,
    fetchStats,
    fetchViolations,
    fetchAuditEntries,
    fetchDocumentLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    applyLabel,
    removeLabel,
    acknowledgeLabel,
    resolveViolation,
    getAuditTrail,
    generateReport
  };
};
