import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Cloud,
  HardDrive,
  Database,
  Play,
  Pause,
  Square,
  RotateCcw,
  Plus,
  Settings,
  Activity,
  FileText,
  Users,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  ArrowRight,
  Download
} from 'lucide-react';
import { useMigration } from '@/hooks/useMigration';
import { CreateMigrationDialog } from './CreateMigrationDialog';
import { MigrationJobCard } from './MigrationJobCard';
import { MigrationItemsList } from './MigrationItemsList';
import { MigrationMetricsPanel } from './MigrationMetricsPanel';
import { IdentityMappingPanel } from './IdentityMappingPanel';
import { CredentialsPanel } from './CredentialsPanel';
import type { MigrationJob, SourceSystem } from '@/types/migration';

export function MigrationDashboard() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('jobs');

  const {
    jobs,
    jobItems,
    metrics,
    auditLogs,
    credentials,
    identityMappings,
    selectedJobId,
    jobsLoading,
    itemsLoading,
    setSelectedJobId,
    createJob,
    startJob,
    pauseJob,
    resumeJob,
    cancelJob,
    retryFailed,
    getJobStats,
    isCreating
  } = useMigration();

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  // Calculate overall stats
  const stats = {
    totalJobs: jobs.length,
    activeJobs: jobs.filter(j => ['running', 'discovering'].includes(j.status)).length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
    failedJobs: jobs.filter(j => j.status === 'failed').length,
    totalFiles: jobs.reduce((sum, j) => sum + j.total_items, 0),
    processedFiles: jobs.reduce((sum, j) => sum + j.processed_items, 0)
  };

  const getSourceIcon = (source: SourceSystem) => {
    switch (source) {
      case 'google_drive': return <Cloud className="h-5 w-5 text-blue-500" />;
      case 'onedrive': return <HardDrive className="h-5 w-5 text-sky-500" />;
      case 'filenet': return <Database className="h-5 w-5 text-purple-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Migration Center</h1>
          <p className="text-muted-foreground">
            Migrate documents from Google Drive, OneDrive, and FileNet
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Migration
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Jobs</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold">{stats.activeJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold">{stats.completedJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
            <p className="text-2xl font-bold">{stats.failedJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Files</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalFiles.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Migrated</span>
            </div>
            <p className="text-2xl font-bold">{stats.processedFiles.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="jobs">Migration Jobs</TabsTrigger>
          <TabsTrigger value="metrics">Live Metrics</TabsTrigger>
          <TabsTrigger value="identities">Identity Mapping</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Jobs List */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Jobs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                  {jobsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : jobs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No migration jobs yet</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setShowCreateDialog(true)}
                      >
                        Create your first migration
                      </Button>
                    </div>
                  ) : (
                    jobs.map(job => (
                      <MigrationJobCard
                        key={job.id}
                        job={job}
                        isSelected={job.id === selectedJobId}
                        onClick={() => setSelectedJobId(job.id)}
                        onStart={() => startJob(job.id)}
                        onPause={() => pauseJob(job.id)}
                        onResume={() => resumeJob(job.id)}
                        onCancel={() => cancelJob(job.id)}
                        stats={getJobStats(job)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Job Details */}
            <div className="lg:col-span-2">
              {selectedJob ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getSourceIcon(selectedJob.source_system)}
                        <div>
                          <CardTitle>{selectedJob.name}</CardTitle>
                          <CardDescription>
                            {selectedJob.source_system?.replace('_', ' ') || 'Unknown'} → SimplifyDrive
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {selectedJob.status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryFailed(selectedJob.id)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Retry Failed
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MigrationItemsList
                      items={jobItems}
                      isLoading={itemsLoading}
                      job={selectedJob}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a job to view details</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <MigrationMetricsPanel
            job={selectedJob}
            metrics={metrics}
            auditLogs={auditLogs}
          />
        </TabsContent>

        <TabsContent value="identities">
          <IdentityMappingPanel mappings={identityMappings} />
        </TabsContent>

        <TabsContent value="credentials">
          <CredentialsPanel credentials={credentials} />
        </TabsContent>
      </Tabs>

      <CreateMigrationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={createJob}
        credentials={credentials}
        isLoading={isCreating}
      />
    </div>
  );
}
