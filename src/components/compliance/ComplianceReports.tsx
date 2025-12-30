import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  BarChart3,
  FileText,
  Download,
  Calendar as CalendarIcon,
  Shield,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  TrendingUp,
  Clock,
  FileSpreadsheet,
  Printer,
  Mail,
  Building2,
  Heart,
  CreditCard
} from 'lucide-react';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import { ComplianceFramework, COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { format as formatDate, subDays, subMonths } from 'date-fns';
import { toast } from 'sonner';

interface ReportConfig {
  type: 'summary' | 'detailed' | 'violations' | 'audit_trail' | 'data_mapping';
  name: string;
  description: string;
  icon: React.ReactNode;
  fields: string[];
}

const reportTypes: ReportConfig[] = [
  {
    type: 'summary',
    name: 'Summary Report',
    description: 'High-level compliance overview with key metrics and trends',
    icon: <BarChart3 className="h-5 w-5" />,
    fields: ['Compliance Score', 'Document Coverage', 'Framework Distribution', 'Violation Summary']
  },
  {
    type: 'data_mapping',
    name: 'Data Mapping Report',
    description: 'Where sensitive data resides across your organization',
    icon: <PieChart className="h-5 w-5" />,
    fields: ['Data Classification', 'Sensitivity Levels', 'Data Categories', 'Geographic Distribution']
  },
  {
    type: 'violations',
    name: 'Violations Report',
    description: 'Detailed breakdown of compliance violations and resolutions',
    icon: <AlertTriangle className="h-5 w-5" />,
    fields: ['Violation Types', 'Severity Analysis', 'Resolution Status', 'User Involvement']
  },
  {
    type: 'audit_trail',
    name: 'Full Audit Report',
    description: 'Complete audit trail for regulatory requirements',
    icon: <FileText className="h-5 w-5" />,
    fields: ['All Actions', 'User Activity', 'Document Changes', 'Compliance Events']
  }
];

export const ComplianceReports: React.FC = () => {
  const { labels, violations, stats, generateReport, isLoading, auditEntries } = useComplianceLabels();
  const [selectedReport, setSelectedReport] = useState<ReportConfig | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [selectedFramework, setSelectedFramework] = useState<ComplianceFramework | 'all'>('all');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(new Date(), 1),
    to: new Date()
  });
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');

  const complianceScore = Math.round(
    (stats.labeled_documents / (stats.labeled_documents + stats.unlabeled_documents)) * 100
  ) || 0;

  const handleGenerateReport = async (reportType: ReportConfig['type']) => {
    setIsGenerating(true);
    try {
      const report = await generateReport(reportType);
      setGeneratedReport(report);
      toast.success('Report generated successfully');
      return report; // Return the report for immediate use
    } catch (error) {
      toast.error('Failed to generate report');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportReport = (exportFmt: 'pdf' | 'csv' | 'json', reportDataOverride?: any) => {
    const reportData = reportDataOverride || generatedReport?.report_data || generatedReport;
    if (!reportData) {
      toast.error('No report data available');
      return;
    }
    const dateStr = formatDate(new Date(), 'yyyy-MM-dd');
    
    if (exportFmt === 'json') {
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFmt === 'csv') {
      // Generate CSV based on report type
      let csv = '';
      
      if (reportData.type === 'summary' || reportData.type === 'detailed') {
        csv = [
          'Metric,Value',
          `Compliance Score,${complianceScore}%`,
          `Total Labels,${stats.total_labels}`,
          `Active Labels,${stats.active_labels}`,
          `Labeled Documents,${stats.labeled_documents}`,
          `Unlabeled Documents,${stats.unlabeled_documents}`,
          `Active Violations,${stats.active_violations}`,
          `Resolved Violations,${stats.resolved_violations}`,
          `Pending Reviews,${stats.pending_reviews}`,
          '',
          'Framework Distribution',
          'Framework,Document Count',
          ...Object.entries(stats.labels_by_framework)
            .filter(([_, count]) => count > 0)
            .map(([fw, count]) => `${fw},${count}`),
          '',
          'Classification Distribution',
          'Classification,Document Count',
          ...Object.entries(stats.labels_by_classification)
            .filter(([_, count]) => count > 0)
            .map(([cls, count]) => `${cls},${count}`)
        ].join('\n');
      } else if (reportData.type === 'data_mapping') {
        const mappings = reportData.data_mappings || [];
        csv = [
          'Document Title,File Type,Label,Framework,Classification,Retention Days,Auto Classified,Labeled Date',
          ...mappings.map((m: any) => 
            `"${m.document_title || 'N/A'}",${m.file_type || 'N/A'},"${m.label_name || 'N/A'}",${m.framework || 'N/A'},${m.classification || 'N/A'},${m.retention_days || 'N/A'},${m.auto_classified ? 'Yes' : 'No'},${m.labeled_date || 'N/A'}`
          )
        ].join('\n');
      } else if (reportData.type === 'violations') {
        const violationsList = reportData.violations || violations;
        csv = [
          'Type,Severity,Description,Framework,Status,Detected At,Resolution Notes',
          ...violationsList.map((v: any) => 
            `${v.violation_type},${v.severity},"${v.description}",${v.framework || 'N/A'},${v.resolved ? 'Resolved' : 'Active'},${v.detected_at},"${v.resolution_notes || ''}"`
          )
        ].join('\n');
      } else if (reportData.type === 'audit_trail') {
        const auditList = reportData.audit_entries || auditEntries;
        csv = [
          'Date,Action,Performed By,Document,Label,Framework,Details',
          ...auditList.map((e: any) => 
            `${e.performed_at},${e.action},"${e.performed_by || 'System'}","${e.document_title || 'N/A'}","${e.label_name || 'N/A'}",${e.framework || 'N/A'},"${e.details || ''}"`
          )
        ].join('\n');
      }

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${reportData.type}-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // For PDF, we'll create an HTML printable version
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        // Summary Report specific content
        const summaryHtml = (reportData.type === 'summary' || reportData.type === 'detailed')
          ? `
            <h2>Compliance Labels (${(reportData.labels || []).length})</h2>
            ${(reportData.labels || []).length > 0 ? `
              <table>
                <thead>
                  <tr><th>Label Name</th><th>Framework</th><th>Classification</th><th>Retention</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${(reportData.labels || []).map((l: any) => `
                    <tr>
                      <td>${l.name}</td>
                      <td>${l.framework}</td>
                      <td>${l.classification || 'N/A'}</td>
                      <td>${l.retention_days ? `${l.retention_days} days` : 'N/A'}</td>
                      <td><span class="badge ${l.is_active ? 'badge-resolved' : 'badge-active'}">${l.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p class="no-data">No compliance labels created yet.</p>'}

            <h2>Violations Summary</h2>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-value" style="color: #dc2626;">${reportData.violations_summary?.active || 0}</div>
                <div class="stat-label">Active Violations</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #16a34a;">${reportData.violations_summary?.resolved || 0}</div>
                <div class="stat-label">Resolved Violations</div>
              </div>
            </div>

            <h2>Documents by Label</h2>
            ${Object.keys(reportData.documents_by_label || {}).length > 0 ? `
              <table>
                <thead>
                  <tr><th>Label</th><th>Document Count</th></tr>
                </thead>
                <tbody>
                  ${Object.entries(reportData.documents_by_label || {}).map(([label, count]) => `
                    <tr>
                      <td>${label}</td>
                      <td>${count}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p class="no-data">No documents labeled yet.</p>'}
          ` : '';

        const violationsHtml = reportData.type === 'violations' 
          ? `
            <h2>Violations Report (${(reportData.violations || []).length} total)</h2>
            
            <h3>Severity Breakdown</h3>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-value" style="color: #b91c1c;">${reportData.violations_by_severity?.critical || 0}</div>
                <div class="stat-label">Critical</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #c2410c;">${reportData.violations_by_severity?.high || 0}</div>
                <div class="stat-label">High</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #a16207;">${reportData.violations_by_severity?.medium || 0}</div>
                <div class="stat-label">Medium</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #15803d;">${reportData.violations_by_severity?.low || 0}</div>
                <div class="stat-label">Low</div>
              </div>
            </div>

            ${(reportData.violations || []).length > 0 ? `
              <h3>All Violations</h3>
              <table>
                <thead>
                  <tr><th>Type</th><th>Severity</th><th>Description</th><th>Framework</th><th>Status</th><th>Detected</th></tr>
                </thead>
                <tbody>
                  ${(reportData.violations || []).map((v: any) => `
                    <tr>
                      <td>${v.violation_type?.replace(/_/g, ' ') || 'N/A'}</td>
                      <td><span class="badge badge-${v.severity}">${v.severity}</span></td>
                      <td>${v.description}</td>
                      <td>${v.framework || 'N/A'}</td>
                      <td><span class="badge ${v.resolved ? 'badge-resolved' : 'badge-active'}">${v.resolved ? 'Resolved' : 'Active'}</span></td>
                      <td>${new Date(v.detected_at).toLocaleDateString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p class="no-data">No violations recorded.</p>'}
          ` : '';

        const auditHtml = reportData.type === 'audit_trail'
          ? `
            <h2>Audit Trail Report</h2>
            
            ${Object.keys(reportData.action_summary || {}).length > 0 ? `
              <h3>Action Summary</h3>
              <table>
                <thead>
                  <tr><th>Action</th><th>Count</th></tr>
                </thead>
                <tbody>
                  ${Object.entries(reportData.action_summary || {}).map(([action, count]) => `
                    <tr>
                      <td>${action}</td>
                      <td>${count}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}

            <h3>All Audit Entries (${(reportData.audit_entries || []).length})</h3>
            ${(reportData.audit_entries || []).length > 0 ? `
              <table>
                <thead>
                  <tr><th>Date</th><th>Action</th><th>Performed By</th><th>Document</th><th>Label</th><th>Details</th></tr>
                </thead>
                <tbody>
                  ${(reportData.audit_entries || []).map((e: any) => `
                    <tr>
                      <td>${new Date(e.performed_at).toLocaleString()}</td>
                      <td>${e.action}</td>
                      <td>${e.performed_by || 'System'}</td>
                      <td>${e.document_title || 'N/A'}</td>
                      <td>${e.label_name || 'N/A'}</td>
                      <td>${e.details || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p class="no-data">No audit entries found. Audit entries are created when compliance labels are applied, removed, or modified.</p>'}
          ` : '';

        const dataMappingHtml = reportData.type === 'data_mapping'
          ? `
            <h2>Data Mapping Report</h2>
            
            ${Object.keys(reportData.classification_summary || {}).length > 0 ? `
              <h3>Classification Summary</h3>
              <div class="stat-grid">
                ${Object.entries(reportData.classification_summary || {}).map(([cls, count]) => `
                  <div class="stat-card">
                    <div class="stat-value">${count}</div>
                    <div class="stat-label">${cls}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <h3>Document Data Mappings (${(reportData.data_mappings || []).length})</h3>
            ${(reportData.data_mappings || []).length > 0 ? `
              <table>
                <thead>
                  <tr><th>Document</th><th>Label</th><th>Framework</th><th>Classification</th><th>Retention</th><th>Labeled Date</th></tr>
                </thead>
                <tbody>
                  ${(reportData.data_mappings || []).map((m: any) => `
                    <tr>
                      <td>${m.document_title || 'N/A'}</td>
                      <td>${m.label_name || 'N/A'}</td>
                      <td>${m.framework || 'N/A'}</td>
                      <td><span class="badge badge-${m.classification}">${m.classification || 'N/A'}</span></td>
                      <td>${m.retention_days ? `${m.retention_days} days` : 'N/A'}</td>
                      <td>${m.labeled_date ? new Date(m.labeled_date).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p class="no-data">No data mappings found. Apply compliance labels to documents to see data mappings.</p>'}
          ` : '';

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Compliance Report - ${new Date().toLocaleDateString()}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; }
                h1 { color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
                h2 { color: #374151; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
                h3 { color: #4b5563; margin-top: 20px; }
                .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
                .stat-card { background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; }
                .stat-value { font-size: 32px; font-weight: bold; color: #3b82f6; }
                .stat-label { color: #6b7280; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
                th { background: #f9fafb; font-weight: 600; }
                .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
                .badge-active { background: #fee2e2; color: #dc2626; }
                .badge-resolved { background: #dcfce7; color: #16a34a; }
                .badge-critical { background: #fecaca; color: #b91c1c; }
                .badge-high { background: #fed7aa; color: #c2410c; }
                .badge-medium { background: #fef08a; color: #a16207; }
                .badge-low { background: #bbf7d0; color: #15803d; }
                .badge-public { background: #dbeafe; color: #1d4ed8; }
                .badge-internal { background: #e0e7ff; color: #4338ca; }
                .badge-confidential { background: #fef3c7; color: #b45309; }
                .badge-highly_confidential { background: #fee2e2; color: #dc2626; }
                .badge-restricted { background: #fecaca; color: #b91c1c; }
                .no-data { background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; color: #6b7280; font-style: italic; }
                .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
                @media print { body { padding: 20px; } }
              </style>
            </head>
            <body>
              <h1>📊 Compliance Report</h1>
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Report Type:</strong> ${reportData.type?.replace('_', ' ').toUpperCase() || 'Summary'}</p>
              <p><strong>Framework Filter:</strong> ${reportData.framework_filter || 'All'}</p>
              
              <h2>Overview</h2>
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="stat-value">${complianceScore}%</div>
                  <div class="stat-label">Compliance Score</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${stats.labeled_documents}</div>
                  <div class="stat-label">Labeled Documents</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${stats.active_violations}</div>
                  <div class="stat-label">Active Violations</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${stats.pending_reviews}</div>
                  <div class="stat-label">Pending Reviews</div>
                </div>
              </div>

              <h2>Framework Distribution</h2>
              <table>
                <thead>
                  <tr><th>Framework</th><th>Documents</th><th>Percentage</th></tr>
                </thead>
                <tbody>
                  ${Object.entries(stats.labels_by_framework)
                    .filter(([_, count]) => count > 0)
                    .map(([fw, count]) => `
                      <tr>
                        <td>${COMPLIANCE_FRAMEWORKS[fw as ComplianceFramework]?.name || fw}</td>
                        <td>${count}</td>
                        <td>${stats.labeled_documents > 0 ? Math.round((count / stats.labeled_documents) * 100) : 0}%</td>
                      </tr>
                    `).join('') || '<tr><td colspan="3" class="no-data">No framework data available</td></tr>'}
                </tbody>
              </table>

              ${summaryHtml}
              ${violationsHtml}
              ${auditHtml}
              ${dataMappingHtml}

              <div class="footer">
                <p>This report was automatically generated by SimplifyAI DocFlow Compliance System.</p>
                <p>Generated by: ${reportData.generated_by || 'System'}</p>
                <p>For questions, contact your compliance administrator.</p>
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }
    }

    toast.success(`Report exported as ${exportFmt.toUpperCase()}`);
  };

  const frameworkStats = Object.entries(stats.labels_by_framework)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Report Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportTypes.map((report) => (
          <Card 
            key={report.type}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedReport(report)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    {report.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{report.name}</CardTitle>
                    <CardDescription>{report.description}</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {report.fields.map((field, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {field}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Framework Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Framework Distribution
          </CardTitle>
          <CardDescription>Documents labeled by compliance framework</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {frameworkStats.map(([framework, count]) => {
              const config = COMPLIANCE_FRAMEWORKS[framework as ComplianceFramework];
              const percentage = Math.round((count / stats.labeled_documents) * 100) || 0;
              
              return (
                <div key={framework} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${config?.color || 'bg-gray-500'}`} />
                      <span className="font-medium">{config?.name || framework}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {count} documents ({percentage}%)
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}

            {frameworkStats.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No labeled documents yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-lg">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedReport.icon}
                  Generate {selectedReport.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedReport.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Framework Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Framework Filter</label>
                  <Select 
                    value={selectedFramework} 
                    onValueChange={(v) => setSelectedFramework(v as ComplianceFramework | 'all')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select framework" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Frameworks</SelectItem>
                      {Object.entries(COMPLIANCE_FRAMEWORKS).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Export Format */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Export Format</label>
                  <div className="flex gap-2">
                    <Button 
                      variant={exportFormat === 'pdf' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('pdf')}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      PDF
                    </Button>
                    <Button 
                      variant={exportFormat === 'csv' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('csv')}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant={exportFormat === 'json' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('json')}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                {/* Report Preview */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">Report will include:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {selectedReport.fields.map((field, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        {field}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedReport(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={async () => {
                    const report = await handleGenerateReport(selectedReport.type);
                    if (report) {
                      handleExportReport(exportFormat, report);
                    }
                    setSelectedReport(null);
                  }}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Generate & Export
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
