import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Layers,
  Tag,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  Filter,
  Download,
  Play,
  Pause,
  AlertTriangle,
  Info,
  ChevronRight,
  Clock
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import { COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { toast } from 'sonner';

interface BulkDocument {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  created_at: string;
  labels: { id: string; name: string; color: string }[];
  selected: boolean;
}

interface BulkOperation {
  id: string;
  type: 'apply' | 'remove' | 'replace' | 'clear';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_documents: number;
  processed_documents: number;
  successful: number;
  failed: number;
  label_id?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export const ComplianceBulkOperations: React.FC = () => {
  const { labels } = useComplianceLabels();
  const [documents, setDocuments] = useState<BulkDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<BulkDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLabel, setFilterLabel] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectAll, setSelectAll] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  
  // Bulk operation state
  const [isOperationDialogOpen, setIsOperationDialogOpen] = useState(false);
  const [operationType, setOperationType] = useState<'apply' | 'remove' | 'replace' | 'clear'>('apply');
  const [selectedLabelId, setSelectedLabelId] = useState<string>('');
  const [replaceLabelId, setReplaceLabelId] = useState<string>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Operation progress
  const [currentOperation, setCurrentOperation] = useState<BulkOperation | null>(null);
  const [operationHistory, setOperationHistory] = useState<BulkOperation[]>([]);

  // Initialize mock documents
  useEffect(() => {
    const mockDocs: BulkDocument[] = [
      { id: '1', name: 'financial_report_Q4.pdf', path: '/Finance/Reports', type: 'pdf', size: 2500000, created_at: new Date(Date.now() - 86400000 * 5).toISOString(), labels: [{ id: '1', name: 'GDPR Compliant', color: '#10B981' }], selected: false },
      { id: '2', name: 'employee_records.xlsx', path: '/HR/Records', type: 'xlsx', size: 1500000, created_at: new Date(Date.now() - 86400000 * 10).toISOString(), labels: [{ id: '2', name: 'HIPAA Protected', color: '#3B82F6' }], selected: false },
      { id: '3', name: 'medical_data.docx', path: '/Medical/Patient', type: 'docx', size: 800000, created_at: new Date(Date.now() - 86400000 * 2).toISOString(), labels: [], selected: false },
      { id: '4', name: 'payment_processing.pdf', path: '/Finance/Payments', type: 'pdf', size: 3200000, created_at: new Date(Date.now() - 86400000 * 7).toISOString(), labels: [{ id: '3', name: 'PCI-DSS Required', color: '#F59E0B' }], selected: false },
      { id: '5', name: 'customer_data.csv', path: '/Sales/Customers', type: 'csv', size: 5000000, created_at: new Date(Date.now() - 86400000 * 15).toISOString(), labels: [{ id: '1', name: 'GDPR Compliant', color: '#10B981' }], selected: false },
      { id: '6', name: 'audit_log_2024.pdf', path: '/Compliance/Audits', type: 'pdf', size: 4500000, created_at: new Date(Date.now() - 86400000 * 3).toISOString(), labels: [{ id: '4', name: 'SOX Audit Trail', color: '#8B5CF6' }], selected: false },
      { id: '7', name: 'legal_contract.docx', path: '/Legal/Contracts', type: 'docx', size: 1200000, created_at: new Date(Date.now() - 86400000 * 8).toISOString(), labels: [], selected: false },
      { id: '8', name: 'privacy_policy.pdf', path: '/Legal/Policies', type: 'pdf', size: 600000, created_at: new Date(Date.now() - 86400000 * 20).toISOString(), labels: [{ id: '5', name: 'CCPA Notice Required', color: '#EC4899' }], selected: false },
      { id: '9', name: 'backup_data.zip', path: '/IT/Backups', type: 'zip', size: 50000000, created_at: new Date(Date.now() - 86400000).toISOString(), labels: [], selected: false },
      { id: '10', name: 'training_materials.pptx', path: '/HR/Training', type: 'pptx', size: 8000000, created_at: new Date(Date.now() - 86400000 * 12).toISOString(), labels: [], selected: false }
    ];
    setDocuments(mockDocs);
    setFilteredDocuments(mockDocs);
  }, []);

  // Filter documents
  useEffect(() => {
    let filtered = [...documents];
    
    if (searchQuery) {
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.path.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterLabel !== 'all') {
      if (filterLabel === 'unlabeled') {
        filtered = filtered.filter(d => d.labels.length === 0);
      } else {
        filtered = filtered.filter(d => d.labels.some(l => l.id === filterLabel));
      }
    }
    
    if (filterType !== 'all') {
      filtered = filtered.filter(d => d.type === filterType);
    }
    
    setFilteredDocuments(filtered);
  }, [documents, searchQuery, filterLabel, filterType]);

  // Update selected count
  useEffect(() => {
    setSelectedCount(documents.filter(d => d.selected).length);
  }, [documents]);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    const filteredIds = filteredDocuments.map(d => d.id);
    setDocuments(prev => prev.map(d => ({
      ...d,
      selected: filteredIds.includes(d.id) ? checked : d.selected
    })));
  };

  const handleSelectDocument = (docId: string, checked: boolean) => {
    setDocuments(prev => prev.map(d => 
      d.id === docId ? { ...d, selected: checked } : d
    ));
  };

  const handleStartOperation = () => {
    if (operationType === 'apply' && !selectedLabelId) {
      toast.error('Please select a label to apply');
      return;
    }
    if (operationType === 'remove' && !selectedLabelId) {
      toast.error('Please select a label to remove');
      return;
    }
    if (operationType === 'replace' && (!selectedLabelId || !replaceLabelId)) {
      toast.error('Please select both labels for replacement');
      return;
    }
    setShowConfirmDialog(true);
  };

  const executeOperation = async () => {
    setShowConfirmDialog(false);
    setIsOperationDialogOpen(false);

    const selectedDocs = documents.filter(d => d.selected);
    const operation: BulkOperation = {
      id: `op-${Date.now()}`,
      type: operationType,
      status: 'running',
      total_documents: selectedDocs.length,
      processed_documents: 0,
      successful: 0,
      failed: 0,
      label_id: selectedLabelId,
      started_at: new Date().toISOString()
    };

    setCurrentOperation(operation);

    // Simulate operation progress
    for (let i = 0; i < selectedDocs.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const success = Math.random() > 0.1; // 90% success rate
      
      setCurrentOperation(prev => prev ? {
        ...prev,
        processed_documents: i + 1,
        successful: prev.successful + (success ? 1 : 0),
        failed: prev.failed + (success ? 0 : 1)
      } : null);

      if (success) {
        // Update document labels based on operation type
        setDocuments(prev => prev.map(d => {
          if (d.id !== selectedDocs[i].id) return d;
          
          const selectedLabel = labels.find(l => l.id === selectedLabelId);
          
          switch (operationType) {
            case 'apply':
              if (selectedLabel && !d.labels.some(l => l.id === selectedLabelId)) {
                return { ...d, labels: [...d.labels, { id: selectedLabel.id, name: selectedLabel.name, color: selectedLabel.color }] };
              }
              return d;
            case 'remove':
              return { ...d, labels: d.labels.filter(l => l.id !== selectedLabelId) };
            case 'replace':
              const replaceLabel = labels.find(l => l.id === replaceLabelId);
              if (replaceLabel) {
                return { 
                  ...d, 
                  labels: d.labels.map(l => l.id === selectedLabelId 
                    ? { id: replaceLabel.id, name: replaceLabel.name, color: replaceLabel.color }
                    : l
                  )
                };
              }
              return d;
            case 'clear':
              return { ...d, labels: [] };
            default:
              return d;
          }
        }));
      }
    }

    // Complete operation
    setCurrentOperation(prev => prev ? {
      ...prev,
      status: 'completed',
      completed_at: new Date().toISOString()
    } : null);

    setTimeout(() => {
      setOperationHistory(prev => [currentOperation!, ...prev].slice(0, 10));
      setCurrentOperation(null);
      
      // Clear selection
      setDocuments(prev => prev.map(d => ({ ...d, selected: false })));
      setSelectAll(false);
      
      toast.success('Bulk operation completed');
    }, 1000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getTypeIcon = (type: string) => {
    const colors: Record<string, string> = {
      pdf: 'text-red-500',
      docx: 'text-blue-500',
      xlsx: 'text-green-500',
      csv: 'text-orange-500',
      pptx: 'text-purple-500',
      zip: 'text-gray-500'
    };
    return <FileText className={`h-4 w-4 ${colors[type] || 'text-gray-400'}`} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Bulk Operations
          </h2>
          <p className="text-sm text-muted-foreground">
            Apply, remove, or replace compliance labels on multiple documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-sm">
              {selectedCount} selected
            </Badge>
          )}
          <Button 
            onClick={() => setIsOperationDialogOpen(true)}
            disabled={selectedCount === 0}
          >
            <Tag className="h-4 w-4 mr-2" />
            Bulk Action
          </Button>
        </div>
      </div>

      {/* Current Operation Progress */}
      {currentOperation && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                </div>
                <div>
                  <h4 className="font-medium">
                    {currentOperation.type === 'apply' && 'Applying Labels'}
                    {currentOperation.type === 'remove' && 'Removing Labels'}
                    {currentOperation.type === 'replace' && 'Replacing Labels'}
                    {currentOperation.type === 'clear' && 'Clearing Labels'}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {currentOperation.processed_documents} of {currentOperation.total_documents} documents
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-green-500 border-green-500">
                  {currentOperation.successful} success
                </Badge>
                {currentOperation.failed > 0 && (
                  <Badge variant="outline" className="text-red-500 border-red-500">
                    {currentOperation.failed} failed
                  </Badge>
                )}
              </div>
            </div>
            <Progress 
              value={(currentOperation.processed_documents / currentOperation.total_documents) * 100}
              className="h-2"
            />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <Select value={filterLabel} onValueChange={setFilterLabel}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by label" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Labels</SelectItem>
                <SelectItem value="unlabeled">Unlabeled</SelectItem>
                {labels.map(label => (
                  <SelectItem key={label.id} value={label.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="File type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">Word</SelectItem>
                <SelectItem value="xlsx">Excel</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="pptx">PowerPoint</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Documents</CardTitle>
            <span className="text-sm text-muted-foreground">
              {filteredDocuments.length} documents
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {/* Header */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg text-sm font-medium text-muted-foreground">
                <Checkbox 
                  checked={selectAll}
                  onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                />
                <span className="flex-1">Document</span>
                <span className="w-32">Type</span>
                <span className="w-24">Size</span>
                <span className="w-48">Labels</span>
              </div>

              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-4 p-3 rounded-lg transition-colors hover:bg-muted/50 ${
                    doc.selected ? 'bg-primary/5 border border-primary/20' : ''
                  }`}
                >
                  <Checkbox
                    checked={doc.selected}
                    onCheckedChange={(checked) => handleSelectDocument(doc.id, checked as boolean)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.path}</p>
                  </div>
                  <div className="w-32 flex items-center gap-2">
                    {getTypeIcon(doc.type)}
                    <span className="text-sm uppercase">{doc.type}</span>
                  </div>
                  <div className="w-24 text-sm text-muted-foreground">
                    {formatSize(doc.size)}
                  </div>
                  <div className="w-48 flex flex-wrap gap-1">
                    {doc.labels.length === 0 ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        No labels
                      </Badge>
                    ) : (
                      doc.labels.map(label => (
                        <Badge
                          key={label.id}
                          style={{ backgroundColor: label.color }}
                          className="text-white text-xs"
                        >
                          {label.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Operation History */}
      {operationHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Operations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {operationHistory.slice(0, 5).map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    {op.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : op.status === 'failed' ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {op.type} Labels
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {op.successful} successful, {op.failed} failed
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {op.completed_at ? new Date(op.completed_at).toLocaleString() : 'In progress...'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Action Dialog */}
      <Dialog open={isOperationDialogOpen} onOpenChange={setIsOperationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Label Operation</DialogTitle>
            <DialogDescription>
              {selectedCount} documents selected
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Operation Type</Label>
              <Select value={operationType} onValueChange={(v) => setOperationType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apply">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Apply Label
                    </div>
                  </SelectItem>
                  <SelectItem value="remove">
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Remove Label
                    </div>
                  </SelectItem>
                  <SelectItem value="replace">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Replace Label
                    </div>
                  </SelectItem>
                  <SelectItem value="clear">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Clear All Labels
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {operationType !== 'clear' && (
              <div className="space-y-2">
                <Label>
                  {operationType === 'apply' && 'Label to Apply'}
                  {operationType === 'remove' && 'Label to Remove'}
                  {operationType === 'replace' && 'Label to Replace'}
                </Label>
                <Select value={selectedLabelId} onValueChange={setSelectedLabelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a label" />
                  </SelectTrigger>
                  <SelectContent>
                    {labels.map(label => (
                      <SelectItem key={label.id} value={label.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          <span>{label.name}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {COMPLIANCE_FRAMEWORKS[label.framework]?.name}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {operationType === 'replace' && (
              <div className="space-y-2">
                <Label>Replace With</Label>
                <Select value={replaceLabelId} onValueChange={setReplaceLabelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new label" />
                  </SelectTrigger>
                  <SelectContent>
                    {labels.filter(l => l.id !== selectedLabelId).map(label => (
                      <SelectItem key={label.id} value={label.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          <span>{label.name}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {COMPLIANCE_FRAMEWORKS[label.framework]?.name}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/50 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {operationType === 'apply' && 'This will add the selected label to all selected documents.'}
                {operationType === 'remove' && 'This will remove the selected label from all documents that have it.'}
                {operationType === 'replace' && 'This will replace one label with another on all selected documents.'}
                {operationType === 'clear' && 'This will remove all compliance labels from the selected documents.'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOperationDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartOperation}>
              <Play className="h-4 w-4 mr-2" />
              Start Operation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Operation</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>You are about to perform the following operation:</p>
                <div className="p-3 rounded-lg bg-muted mt-2">
                  <p><strong>Action:</strong> {operationType.charAt(0).toUpperCase() + operationType.slice(1)} labels</p>
                  <p><strong>Documents:</strong> {selectedCount}</p>
                  {selectedLabelId && (
                    <p><strong>Label:</strong> {labels.find(l => l.id === selectedLabelId)?.name}</p>
                  )}
                </div>
                <p className="text-sm mt-2">
                  This action will be logged in the audit trail. Do you want to continue?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeOperation}>
              Confirm & Execute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
