import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Wand2,
  Plus,
  FileType,
  Folder,
  Search,
  Tag,
  Sparkles,
  Settings,
  Trash2,
  Edit,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import { ComplianceLabel, COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface AutoApplyRule {
  id: string;
  name: string;
  description?: string;
  condition_type: 'file_type' | 'folder' | 'keyword' | 'metadata' | 'ai_detected';
  condition_value: string;
  label_ids: string[];
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_run?: string;
  documents_matched?: number;
}

const conditionTypeConfig: Record<string, { label: string; icon: React.ReactNode; placeholder: string; description: string }> = {
  file_type: { 
    label: 'File Type', 
    icon: <FileType className="h-4 w-4" />, 
    placeholder: '.pdf, .docx, .xlsx',
    description: 'Apply to documents with specific file extensions'
  },
  folder: { 
    label: 'Folder Path', 
    icon: <Folder className="h-4 w-4" />, 
    placeholder: '/HR/Employee Records',
    description: 'Apply to documents in specific folders'
  },
  keyword: { 
    label: 'Keywords', 
    icon: <Search className="h-4 w-4" />, 
    placeholder: 'confidential, SSN, credit card',
    description: 'Apply when document contains specific keywords'
  },
  metadata: { 
    label: 'Metadata', 
    icon: <Tag className="h-4 w-4" />, 
    placeholder: 'department:finance, category:legal',
    description: 'Apply based on document metadata fields'
  },
  ai_detected: { 
    label: 'AI Detection', 
    icon: <Sparkles className="h-4 w-4" />, 
    placeholder: 'pii, phi, financial_data',
    description: 'Apply when AI detects specific data types'
  }
};

export const ComplianceAutoApplyRules: React.FC = () => {
  const { labels } = useComplianceLabels();
  const [rules, setRules] = useState<AutoApplyRule[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AutoApplyRule | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<AutoApplyRule>>({
    name: '',
    description: '',
    condition_type: 'file_type',
    condition_value: '',
    label_ids: [],
    priority: 10,
    is_active: true
  });

  // Mock rules for demo
  useEffect(() => {
    setRules([
      {
        id: '1',
        name: 'HIPAA for Medical Documents',
        description: 'Auto-apply HIPAA label to documents in medical folders',
        condition_type: 'folder',
        condition_value: '/Medical Records, /Patient Files, /Healthcare',
        label_ids: ['2'],
        priority: 1,
        is_active: true,
        created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        last_run: new Date(Date.now() - 3600000).toISOString(),
        documents_matched: 45
      },
      {
        id: '2',
        name: 'PCI for Financial Files',
        description: 'Apply PCI-DSS label to documents containing credit card patterns',
        condition_type: 'keyword',
        condition_value: 'credit card, card number, CVV, expiration date, cardholder',
        label_ids: ['3'],
        priority: 2,
        is_active: true,
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        last_run: new Date(Date.now() - 7200000).toISOString(),
        documents_matched: 23
      },
      {
        id: '3',
        name: 'GDPR for EU Customer Data',
        description: 'Auto-detect PII and apply GDPR label',
        condition_type: 'ai_detected',
        condition_value: 'pii, eu_personal_data, name, email, address',
        label_ids: ['1'],
        priority: 3,
        is_active: false,
        created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        documents_matched: 78
      },
      {
        id: '4',
        name: 'SOX Financial Reports',
        description: 'Apply SOX label to Excel and PDF financial reports',
        condition_type: 'file_type',
        condition_value: '.xlsx, .xls, .pdf',
        label_ids: ['4'],
        priority: 4,
        is_active: true,
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        last_run: new Date(Date.now() - 1800000).toISOString(),
        documents_matched: 156
      }
    ]);
  }, []);

  const handleCreateRule = async () => {
    setIsLoading(true);
    try {
      const newRule: AutoApplyRule = {
        ...formData as AutoApplyRule,
        id: `rule-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        documents_matched: 0
      };
      
      setRules(prev => [...prev, newRule]);
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success('Auto-apply rule created');
    } catch (error) {
      toast.error('Failed to create rule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRule = async () => {
    if (!selectedRule) return;
    setIsLoading(true);
    try {
      setRules(prev => prev.map(r => 
        r.id === selectedRule.id 
          ? { ...r, ...formData, updated_at: new Date().toISOString() }
          : r
      ));
      setIsEditDialogOpen(false);
      setSelectedRule(null);
      resetForm();
      toast.success('Rule updated');
    } catch (error) {
      toast.error('Failed to update rule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!selectedRule) return;
    setRules(prev => prev.filter(r => r.id !== selectedRule.id));
    setShowDeleteConfirm(false);
    setSelectedRule(null);
    toast.success('Rule deleted');
  };

  const handleToggleRule = (rule: AutoApplyRule) => {
    setRules(prev => prev.map(r => 
      r.id === rule.id 
        ? { ...r, is_active: !r.is_active, updated_at: new Date().toISOString() }
        : r
    ));
    toast.success(rule.is_active ? 'Rule disabled' : 'Rule enabled');
  };

  const handleRunRule = async (rule: AutoApplyRule) => {
    toast.info(`Running rule: ${rule.name}...`);
    // Simulate running the rule
    setTimeout(() => {
      setRules(prev => prev.map(r => 
        r.id === rule.id 
          ? { 
              ...r, 
              last_run: new Date().toISOString(),
              documents_matched: (r.documents_matched || 0) + Math.floor(Math.random() * 10)
            }
          : r
      ));
      toast.success(`Rule applied to documents`);
    }, 2000);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      condition_type: 'file_type',
      condition_value: '',
      label_ids: [],
      priority: 10,
      is_active: true
    });
  };

  const openEditDialog = (rule: AutoApplyRule) => {
    setSelectedRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      condition_type: rule.condition_type,
      condition_value: rule.condition_value,
      label_ids: rule.label_ids,
      priority: rule.priority,
      is_active: rule.is_active
    });
    setIsEditDialogOpen(true);
  };

  const getLabelName = (labelId: string) => {
    const label = labels.find(l => l.id === labelId);
    return label?.name || 'Unknown Label';
  };

  const getLabelColor = (labelId: string) => {
    const label = labels.find(l => l.id === labelId);
    return label?.color || '#6B7280';
  };

  const activeRules = rules.filter(r => r.is_active);
  const inactiveRules = rules.filter(r => !r.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Auto-Apply Rules
          </h2>
          <p className="text-sm text-muted-foreground">
            Automatically apply compliance labels based on conditions
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeRules.length}</p>
                <p className="text-xs text-muted-foreground">Active Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-500/10 flex items-center justify-center">
                <Pause className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inactiveRules.length}</p>
                <p className="text-xs text-muted-foreground">Inactive Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {rules.reduce((sum, r) => sum + (r.documents_matched || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Documents Labeled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rules</CardTitle>
          <CardDescription>
            Rules are applied in priority order (lower number = higher priority)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Wand2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No auto-apply rules</h3>
                <p className="text-muted-foreground mb-4">
                  Create rules to automatically apply compliance labels
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Rule
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {rules
                  .sort((a, b) => a.priority - b.priority)
                  .map((rule) => {
                    const config = conditionTypeConfig[rule.condition_type];
                    
                    return (
                      <div
                        key={rule.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          rule.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                              rule.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                            }`}>
                              {config?.icon}
                            </div>
                            
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{rule.name}</h4>
                                <Badge variant="outline" className="text-xs">
                                  Priority: {rule.priority}
                                </Badge>
                                {!rule.is_active && (
                                  <Badge variant="secondary" className="text-xs">
                                    Disabled
                                  </Badge>
                                )}
                              </div>
                              
                              {rule.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  {rule.description}
                                </p>
                              )}
                              
                              <div className="flex flex-wrap gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {config?.label}: {rule.condition_value}
                                </Badge>
                              </div>
                              
                              <div className="flex flex-wrap gap-1.5">
                                {rule.label_ids.map(labelId => (
                                  <Badge
                                    key={labelId}
                                    style={{ backgroundColor: getLabelColor(labelId) }}
                                    className="text-white text-xs"
                                  >
                                    {getLabelName(labelId)}
                                  </Badge>
                                ))}
                              </div>
                              
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                {rule.last_run && (
                                  <span>Last run: {new Date(rule.last_run).toLocaleString()}</span>
                                )}
                                <span>{rule.documents_matched || 0} documents matched</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.is_active}
                              onCheckedChange={() => handleToggleRule(rule)}
                            />
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleRunRule(rule)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Run Now
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(rule)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Rule
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedRule(rule);
                                    setShowDeleteConfirm(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={isCreateDialogOpen || isEditDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            setSelectedRule(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditDialogOpen ? 'Edit Auto-Apply Rule' : 'Create Auto-Apply Rule'}
            </DialogTitle>
            <DialogDescription>
              Define conditions for automatic label application
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., HIPAA for Medical Documents"
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this rule does..."
              />
            </div>

            <div className="space-y-2">
              <Label>Condition Type</Label>
              <Select
                value={formData.condition_type}
                onValueChange={(v) => setFormData(prev => ({ 
                  ...prev, 
                  condition_type: v as AutoApplyRule['condition_type']
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(conditionTypeConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {config.icon}
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {conditionTypeConfig[formData.condition_type || 'file_type']?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Condition Value</Label>
              <Input
                value={formData.condition_value || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, condition_value: e.target.value }))}
                placeholder={conditionTypeConfig[formData.condition_type || 'file_type']?.placeholder}
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple values with commas
              </p>
            </div>

            <div className="space-y-2">
              <Label>Apply Labels</Label>
              <Select
                value={formData.label_ids?.[0] || ''}
                onValueChange={(v) => setFormData(prev => ({ ...prev, label_ids: [v] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a label" />
                </SelectTrigger>
                <SelectContent>
                  {labels.map((label) => (
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

            <div className="space-y-2">
              <Label>Priority (1 = highest)</Label>
              <Input
                type="number"
                value={formData.priority || 10}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 10 }))}
                min={1}
                max={100}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <span className="text-sm font-medium">Enable Rule</span>
                <p className="text-xs text-muted-foreground">Start applying this rule immediately</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateDialogOpen(false);
                setIsEditDialogOpen(false);
                setSelectedRule(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={isEditDialogOpen ? handleUpdateRule : handleCreateRule}
              disabled={!formData.name || !formData.condition_value || !formData.label_ids?.length || isLoading}
            >
              {isEditDialogOpen ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Auto-Apply Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedRule?.name}". 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
