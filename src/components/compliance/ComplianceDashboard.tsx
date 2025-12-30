import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Shield,
  Heart,
  CreditCard,
  Building2,
  Lock,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  TrendingUp,
  Settings,
  Download,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Activity
} from 'lucide-react';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import {
  ComplianceLabel,
  ComplianceFramework,
  COMPLIANCE_FRAMEWORKS
} from '@/types/compliance';
import { CreateComplianceLabelDialog } from './CreateComplianceLabelDialog';
import { EditComplianceLabelDialog } from './EditComplianceLabelDialog';
import { ComplianceLabelCard } from './ComplianceLabelCard';
import { ComplianceViolationsPanel } from './ComplianceViolationsPanel';
import { ComplianceAuditLog } from './ComplianceAuditLog';
import { ComplianceReports } from './ComplianceReports';
import { LabeledDocumentsList } from './LabeledDocumentsList';

const frameworkIcons: Record<ComplianceFramework, React.ReactNode> = {
  GDPR: <Shield className="h-4 w-4" />,
  HIPAA: <Heart className="h-4 w-4" />,
  SOX: <Building2 className="h-4 w-4" />,
  PCI_DSS: <CreditCard className="h-4 w-4" />,
  CCPA: <Shield className="h-4 w-4" />,
  FERPA: <FileText className="h-4 w-4" />,
  ISO_27001: <Lock className="h-4 w-4" />,
  NIST: <ShieldCheck className="h-4 w-4" />,
  SOC2: <CheckCircle2 className="h-4 w-4" />,
  CUSTOM: <Settings className="h-4 w-4" />
};

export const ComplianceDashboard: React.FC = () => {
  const { labels, stats, violations, deleteLabel } = useComplianceLabels();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFramework, setSelectedFramework] = useState<ComplianceFramework | 'all'>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<ComplianceLabel | null>(null);
  const [activeTab, setActiveTab] = useState('labels');
  const [filterLabelId, setFilterLabelId] = useState<string | undefined>(undefined);

  const handleEditLabel = (label: ComplianceLabel) => {
    setSelectedLabel(label);
    setIsEditDialogOpen(true);
  };

  const handleViewDocuments = (label: ComplianceLabel) => {
    setFilterLabelId(label.id);
    setActiveTab('documents');
  };

  const handleDeleteLabel = async (label: ComplianceLabel) => {
    if (label.is_system_label) {
      return; // Cannot delete system labels
    }
    await deleteLabel(label.id);
  };

  const filteredLabels = labels.filter(label => {
    const matchesSearch = label.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         label.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFramework = selectedFramework === 'all' || label.framework === selectedFramework;
    return matchesSearch && matchesFramework;
  });

  const activeViolations = violations.filter(v => !v.resolved);
  const totalDocuments = stats.labeled_documents + stats.unlabeled_documents;
  const complianceScore = totalDocuments > 0 
    ? Math.round((stats.labeled_documents / totalDocuments) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance Labels</h1>
          <p className="text-muted-foreground mt-1">
            Manage regulatory compliance labels and data classification
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Label
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Compliance Score</p>
                <p className="text-3xl font-bold text-primary">{complianceScore}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </div>
            <Progress value={complianceScore} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Labeled Documents</p>
                <p className="text-3xl font-bold">{stats.labeled_documents}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.unlabeled_documents} documents need labeling
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Violations</p>
                <p className="text-3xl font-bold text-destructive">{stats.active_violations}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.resolved_violations} resolved this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Reviews</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending_reviews}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Next review due in 3 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Framework Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Framework Coverage</CardTitle>
          <CardDescription>Documents labeled by compliance framework</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(Object.entries(COMPLIANCE_FRAMEWORKS) as [ComplianceFramework, typeof COMPLIANCE_FRAMEWORKS[ComplianceFramework]][])
              .slice(0, 5)
              .map(([key, config]) => (
                <div
                  key={key}
                  className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedFramework(key);
                    setActiveTab('documents');
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-8 w-8 rounded-lg ${config.color} flex items-center justify-center text-white`}>
                      {frameworkIcons[key]}
                    </div>
                    <span className="font-medium text-sm">{config.name}</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {stats.labels_by_framework[key] || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">documents</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="labels" className="gap-2">
              <Shield className="h-4 w-4" />
              Labels
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" />
              Documents
              {stats.labeled_documents > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {stats.labeled_documents}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="violations" className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              Violations
              {activeViolations.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                  {activeViolations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <Activity className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Reports
            </TabsTrigger>
          </TabsList>

          {activeTab === 'labels' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search labels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <select
                value={selectedFramework}
                onChange={(e) => setSelectedFramework(e.target.value as ComplianceFramework | 'all')}
                className="h-10 px-3 rounded-md border bg-background text-sm"
              >
                <option value="all">All Frameworks</option>
                {Object.entries(COMPLIANCE_FRAMEWORKS).map(([key, config]) => (
                  <option key={key} value={key}>{config.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <TabsContent value="labels" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLabels.map((label) => (
              <ComplianceLabelCard
                key={label.id}
                label={label}
                onEdit={handleEditLabel}
                onDelete={handleDeleteLabel}
                onViewDocuments={handleViewDocuments}
              />
            ))}
            {filteredLabels.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <FileWarning className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No labels found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try adjusting your search' : 'Create your first compliance label'}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <LabeledDocumentsList 
            filterFramework={selectedFramework} 
            filterLabelId={filterLabelId}
          />
        </TabsContent>

        <TabsContent value="violations" className="mt-0">
          <ComplianceViolationsPanel />
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <ComplianceAuditLog />
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <ComplianceReports />
        </TabsContent>
      </Tabs>

      <CreateComplianceLabelDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />

      <EditComplianceLabelDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        label={selectedLabel}
      />
    </div>
  );
};
