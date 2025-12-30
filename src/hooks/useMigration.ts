import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  MigrationJob,
  MigrationItem,
  MigrationConfig,
  MigrationMetrics,
  MigrationAuditLog,
  SourceSystem,
  MigrationCredentials,
  IdentityMapping
} from '@/types/migration';

const API_BASE = 'http://localhost:8000/api/migration';

export function useMigration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Fetch all migration jobs from backend API
  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['migration-jobs'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];

      const response = await fetch(`${API_BASE}/jobs?user_id=${userData.user.id}`);

      if (!response.ok) {
        console.error('Failed to fetch migration jobs:', response.status);
        return [];
      }

      const data = await response.json();
      return data as MigrationJob[];
    },
    refetchInterval: 3000  // Poll every 3 seconds to catch status updates
  });

  // Fetch items for selected job
  const { data: jobItems = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['migration-items', selectedJobId],
    queryFn: async () => {
      if (!selectedJobId) return [];

      const { data, error } = await supabase
        .from('migration_items')
        .select('*')
        .eq('job_id', selectedJobId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as MigrationItem[];
    },
    enabled: !!selectedJobId,
    refetchInterval: 3000  // Poll every 3 seconds
  });

  // Fetch metrics for selected job
  const { data: metrics = [] } = useQuery({
    queryKey: ['migration-metrics', selectedJobId],
    queryFn: async () => {
      if (!selectedJobId) return [];

      const { data, error } = await supabase
        .from('migration_metrics')
        .select('*')
        .eq('job_id', selectedJobId)
        .order('recorded_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      return data as MigrationMetrics[];
    },
    enabled: !!selectedJobId,
    refetchInterval: 5000
  });

  // Fetch audit logs
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['migration-audit-logs', selectedJobId],
    queryFn: async () => {
      if (!selectedJobId) return [];

      const { data, error } = await supabase
        .from('migration_audit_log')
        .select('*')
        .eq('job_id', selectedJobId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as MigrationAuditLog[];
    },
    enabled: !!selectedJobId
  });

  // Fetch credentials from backend API
  const { data: credentials = [] } = useQuery({
    queryKey: ['migration-credentials'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];

      const response = await fetch(`${API_BASE}/credentials?user_id=${userData.user.id}`);

      if (!response.ok) return [];

      const data = await response.json();
      return data as MigrationCredentials[];
    }
  });

  // Fetch identity mappings
  const { data: identityMappings = [] } = useQuery({
    queryKey: ['identity-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('identity_mappings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as IdentityMapping[];
    }
  });

  // Create new migration job via backend API
  const createJobMutation = useMutation({
    mutationFn: async (params: {
      name: string;
      source_system: SourceSystem;
      config: MigrationConfig;
      credentials_id?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const response = await fetch(`${API_BASE}/jobs?user_id=${userData.user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          source_system: params.source_system,
          credentials_id: params.credentials_id || '',
          folder_id: params.config.source_folder_id || null,
          config: params.config
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create job');
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-jobs'] });
      toast({ title: 'Migration job created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create job', description: error.message, variant: 'destructive' });
    }
  });

  // Start migration job via backend API
  const startJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const response = await fetch(
        `${API_BASE}/jobs/${jobId}/start?user_id=${userData.user.id}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start job');
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-jobs'] });
      toast({ title: 'Migration started successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to start migration', description: error.message, variant: 'destructive' });
    }
  });

  // Pause migration job
  const pauseJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('migration_jobs')
        .update({ status: 'paused' })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-jobs'] });
      toast({ title: 'Migration paused' });
    }
  });

  // Resume migration job
  const resumeJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('migration_jobs')
        .update({ status: 'running' })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-jobs'] });
      toast({ title: 'Migration resumed' });
    }
  });

  // Cancel migration job
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('migration_jobs')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-jobs'] });
      toast({ title: 'Migration cancelled' });
    }
  });

  // Retry failed items
  const retryFailedMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('migration_items')
        .update({
          status: 'pending',
          attempt_count: 0,
          last_error: null,
          error_code: null
        })
        .eq('job_id', jobId)
        .eq('status', 'failed');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-items', selectedJobId] });
      toast({ title: 'Retrying failed items' });
    }
  });

  // Save credentials via backend API
  const saveCredentialsMutation = useMutation({
    mutationFn: async (params: {
      name: string;
      source_system: SourceSystem;
      credentials: Record<string, any>;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const response = await fetch(`${API_BASE}/credentials?user_id=${userData.user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          source_system: params.source_system,
          credentials: params.credentials
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save credentials');
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-credentials'] });
      toast({ title: 'Credentials saved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save credentials', description: error.message, variant: 'destructive' });
    }
  });

  // Save identity mapping
  const saveIdentityMappingMutation = useMutation({
    mutationFn: async (mapping: Omit<IdentityMapping, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('identity_mappings')
        .upsert(mapping, { onConflict: 'user_id,source_system,source_principal_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity-mappings'] });
      toast({ title: 'Identity mapping saved' });
    }
  });

  // Get job statistics
  const getJobStats = useCallback((job: MigrationJob) => {
    const progress = job.total_items > 0
      ? Math.round((job.processed_items / job.total_items) * 100)
      : 0;

    const bytesProgress = job.total_bytes > 0
      ? Math.round((job.transferred_bytes / job.total_bytes) * 100)
      : 0;

    const eta = calculateEta(job, metrics[0]);

    return {
      progress,
      bytesProgress,
      eta,
      filesPerMinute: metrics[0]?.files_per_minute || 0,
      bytesPerSecond: metrics[0]?.bytes_per_second || 0,
      throttleCount: metrics[0]?.api_throttle_count || 0
    };
  }, [metrics]);

  return {
    // Data
    jobs,
    jobItems,
    metrics,
    auditLogs,
    credentials,
    identityMappings,
    selectedJobId,

    // Loading states
    jobsLoading,
    itemsLoading,

    // Actions
    setSelectedJobId,
    createJob: createJobMutation.mutate,
    startJob: startJobMutation.mutate,
    pauseJob: pauseJobMutation.mutate,
    resumeJob: resumeJobMutation.mutate,
    cancelJob: cancelJobMutation.mutate,
    retryFailed: retryFailedMutation.mutate,
    saveCredentials: saveCredentialsMutation.mutate,
    saveIdentityMapping: saveIdentityMappingMutation.mutate,
    refetchJobs,
    refetchItems,

    // Helpers
    getJobStats,

    // Mutation states
    isCreating: createJobMutation.isPending,
    isStarting: startJobMutation.isPending
  };
}

function calculateEta(job: MigrationJob, latestMetric?: MigrationMetrics): string | null {
  if (!latestMetric?.files_per_minute || job.status !== 'running') return null;

  const remaining = job.total_items - job.processed_items;
  const minutesRemaining = remaining / latestMetric.files_per_minute;

  if (minutesRemaining < 1) return 'Less than 1 minute';
  if (minutesRemaining < 60) return `~${Math.round(minutesRemaining)} minutes`;

  const hours = Math.floor(minutesRemaining / 60);
  const mins = Math.round(minutesRemaining % 60);
  return `~${hours}h ${mins}m`;
}
