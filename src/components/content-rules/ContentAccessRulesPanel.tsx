import React, { useState } from 'react';
import { DocumentSelector } from '@/components/common/DocumentSelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Plus,
  Shield,
  FileType,
  Tag,
  Folder,
  Lock,
  Download,
  Printer,
  Share2,
  Globe,
  Droplets,
  Bell,
  Trash2,
  Edit,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  GripVertical,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Eye,
} from 'lucide-react';
import { useContentAccessRules, ContentAccessRule, CreateRuleParams } from '@/hooks/useContentAccessRules';
import { formatDistanceToNow } from 'date-fns';

export function ContentAccessRulesPanel() {
  const {
    rules,
    loading,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    getRuleStats,
    fetchApplications,
    applications,
  } = useContentAccessRules();

  const [viewingMatches, setViewingMatches] = useState<ContentAccessRule | null>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<ContentAccessRule | null>(null);
  const [formData, setFormData] = useState<CreateRuleParams>({
    name: '',
    description: '',
    file_types: [],
    name_patterns: [],
    content_keywords: [],
    restrict_download: false,
    restrict_print: false,
    restrict_share: false,
    restrict_external_share: false,
    watermark_required: false,
    notify_on_match: false,
    is_active: true,
    priority: 100,
  });
  const [fileTypeInput, setFileTypeInput] = useState('');
  const [patternInput, setPatternInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  const stats = getRuleStats();

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    // No longer require document selection - criteria-based matching only

    await createRule(formData);
    setShowCreateDialog(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingRule) return;

    await updateRule(editingRule.id, formData);
    setEditingRule(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      file_types: [],
      name_patterns: [],
      content_keywords: [],
      restrict_download: false,
      restrict_print: false,
      restrict_share: false,
      restrict_external_share: false,
      watermark_required: false,
      notify_on_match: false,
      is_active: true,
      priority: 100,
    });
    setFileTypeInput('');
    setPatternInput('');
    setKeywordInput('');
    setSelectedDocIds([]);
  };

  const handleViewMatches = (rule: ContentAccessRule) => {
    setViewingMatches(rule);
    fetchApplications({ ruleId: rule.id });
  };

  const openEditDialog = (rule: ContentAccessRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      file_types: rule.file_types || [],
      name_patterns: rule.name_patterns || [],
      content_keywords: rule.content_keywords || [],
      restrict_download: rule.restrict_download || false,
      restrict_print: rule.restrict_print || false,
      restrict_share: rule.restrict_share || false,
      restrict_external_share: rule.restrict_external_share || false,
      watermark_required: rule.watermark_required || false,
      notify_on_match: rule.notify_on_match || false,
      is_active: rule.is_active,
      priority: rule.priority,
    });
  };

  const addToArray = (field: 'file_types' | 'name_patterns' | 'content_keywords', value: string) => {
    if (!value.trim()) return;
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), value.trim()],
    }));
  };

  const removeFromArray = (field: 'file_types' | 'name_patterns' | 'content_keywords', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field]?.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Content Access Rules</h2>
          <p className="text-muted-foreground">Automatically apply restrictions based on document properties</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Lock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.withRestrictions}</p>
                <p className="text-sm text-muted-foreground">With Restrictions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Zap className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.withAutoActions}</p>
                <p className="text-sm text-muted-foreground">Auto Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Content Rules</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create rules to automatically apply restrictions based on document properties.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Rule
              </Button>
            </CardContent>
          </Card>
        ) : (
          rules.map((rule, index) => (
            <Card key={rule.id} className={`${!rule.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      <Badge variant="outline" className="text-xs">
                        #{rule.priority}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      {rule.description && (
                        <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                      )}

                      {/* Criteria Badges */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {rule.file_types?.length ? (
                          <Badge variant="outline" className="gap-1">
                            <FileType className="h-3 w-3" />
                            {rule.file_types.length} file type(s)
                          </Badge>
                        ) : null}
                        {rule.name_patterns?.length ? (
                          <Badge variant="outline" className="gap-1">
                            <Tag className="h-3 w-3" />
                            {rule.name_patterns.length} pattern(s)
                          </Badge>
                        ) : null}
                        {rule.content_keywords?.length ? (
                          <Badge variant="outline" className="gap-1">
                            <Tag className="h-3 w-3" />
                            {rule.content_keywords.length} keyword(s)
                          </Badge>
                        ) : null}
                      </div>

                      {/* Restrictions */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {rule.restrict_download && (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <Download className="h-3 w-3" />
                            No Download
                          </Badge>
                        )}
                        {rule.restrict_print && (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <Printer className="h-3 w-3" />
                            No Print
                          </Badge>
                        )}
                        {rule.restrict_share && (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <Share2 className="h-3 w-3" />
                            No Share
                          </Badge>
                        )}
                        {rule.restrict_external_share && (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <Globe className="h-3 w-3" />
                            No External
                          </Badge>
                        )}
                        {rule.watermark_required && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Droplets className="h-3 w-3" />
                            Watermark
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => handleViewMatches(rule)} title="View Matched Documents">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(rule)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRule(rule.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || !!editingRule}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingRule(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Content Access Rule'}</DialogTitle>
            <DialogDescription>
              Define criteria to match documents and apply restrictions automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Info Alert */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                ℹ️ <strong>Automatic Matching:</strong> This rule will automatically scan and match documents based on the criteria you define below.
              </p>
            </div>

            {/* Step 1: Basic Info */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Step 1: Rule Details</Label>
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Confidential Documents"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this rule does..."
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            {/* Matching Criteria */}
            <Accordion type="single" collapsible defaultValue="criteria">
              <AccordionItem value="criteria">
                <AccordionTrigger>Matching Criteria</AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {/* File Types */}
                  <div className="space-y-2">
                    <Label>File Types</Label>
                    <p className="text-xs text-muted-foreground">Select document types to match</p>
                    <div className="grid grid-cols-3 gap-2">
                      {['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'csv', 'jpg', 'png', 'zip'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            if (formData.file_types?.includes(type)) {
                              setFormData(prev => ({
                                ...prev,
                                file_types: prev.file_types?.filter(t => t !== type)
                              }));
                            } else {
                              addToArray('file_types', type);
                            }
                          }}
                          className={`px-3 py-2 text-sm border rounded-md transition-colors ${formData.file_types?.includes(type)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:bg-muted border-input'
                            }`}
                        >
                          .{type}
                        </button>
                      ))}
                    </div>
                    {formData.file_types && formData.file_types.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formData.file_types.map((type, i) => (
                          <Badge key={i} variant="secondary" className="gap-1">
                            .{type}
                            <button onClick={() => removeFromArray('file_types', i)}>
                              <XCircle className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name Patterns */}
                  <div className="space-y-2">
                    <Label>Name Patterns (Regex)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={patternInput}
                        onChange={e => setPatternInput(e.target.value)}
                        placeholder="e.g., confidential, secret, private"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addToArray('name_patterns', patternInput);
                            setPatternInput('');
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          addToArray('name_patterns', patternInput);
                          setPatternInput('');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.name_patterns?.map((pattern, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          {pattern}
                          <button onClick={() => removeFromArray('name_patterns', i)}>
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Content Keywords */}
                  <div className="space-y-2">
                    <Label>Content Keywords</Label>
                    <div className="flex gap-2">
                      <Input
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        placeholder="e.g., SSN, credit card, password"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addToArray('content_keywords', keywordInput);
                            setKeywordInput('');
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          addToArray('content_keywords', keywordInput);
                          setKeywordInput('');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.content_keywords?.map((keyword, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          {keyword}
                          <button onClick={() => removeFromArray('content_keywords', i)}>
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="restrictions">
                <AccordionTrigger>Access Restrictions</AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setFormData(prev => ({ ...prev, restrict_download: !prev.restrict_download }))}
                    >
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-muted-foreground" />
                        <Label className="cursor-pointer">Restrict Download</Label>
                      </div>
                      <Switch
                        checked={formData.restrict_download}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, restrict_download: checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setFormData(prev => ({ ...prev, restrict_print: !prev.restrict_print }))}
                    >
                      <div className="flex items-center gap-2">
                        <Printer className="h-4 w-4 text-muted-foreground" />
                        <Label className="cursor-pointer">Restrict Print</Label>
                      </div>
                      <Switch
                        checked={formData.restrict_print}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, restrict_print: checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setFormData(prev => ({ ...prev, restrict_share: !prev.restrict_share }))}
                    >
                      <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4 text-muted-foreground" />
                        <Label className="cursor-pointer">Restrict Sharing</Label>
                      </div>
                      <Switch
                        checked={formData.restrict_share}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, restrict_share: checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setFormData(prev => ({ ...prev, restrict_external_share: !prev.restrict_external_share }))}
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <Label className="cursor-pointer">No External Share</Label>
                      </div>
                      <Switch
                        checked={formData.restrict_external_share}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, restrict_external_share: checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setFormData(prev => ({ ...prev, watermark_required: !prev.watermark_required }))}
                    >
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-muted-foreground" />
                        <Label className="cursor-pointer">Require Watermark</Label>
                      </div>
                      <Switch
                        checked={formData.watermark_required}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, watermark_required: checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setFormData(prev => ({ ...prev, notify_on_match: !prev.notify_on_match }))}
                    >
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <Label className="cursor-pointer">Notify on Match</Label>
                      </div>
                      <Switch
                        checked={formData.notify_on_match}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, notify_on_match: checked }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingRule(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingRule ? handleUpdate : handleCreate}
              disabled={!formData.name.trim()}
            >
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Matches Dialog */}
      <Dialog open={!!viewingMatches} onOpenChange={(open) => !open && setViewingMatches(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Rule Applications: {viewingMatches?.name}</DialogTitle>
            <DialogDescription>
              Documents that matched this rule and had restrictions applied.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ScrollArea className="h-[400px]">
              {applications.length === 0 ? (
                <div className="text-center text-muted-foreground p-8">No matching documents found.</div>
              ) : (
                <div className="space-y-2">
                  {applications.map((app: any) => (
                    <Card key={app.id}>
                      <CardContent className="p-4 flex justify-between items-center">
                        <div>
                          <p className="font-medium">{app.document?.file_name || 'Unknown Document'}</p>
                          <p className="text-xs text-muted-foreground">Applied: {new Date(app.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {app.actions_applied?.restrict_download && <Badge variant="destructive" className="text-xs">No Download</Badge>}
                          {app.actions_applied?.restrict_print && <Badge variant="destructive" className="text-xs">No Print</Badge>}
                          {app.actions_applied?.restrict_share && <Badge variant="destructive" className="text-xs">No Share</Badge>}
                          {app.actions_applied?.restrict_external_share && <Badge variant="destructive" className="text-xs">No Ext. Share</Badge>}
                          {app.actions_applied?.watermark_required && <Badge variant="secondary" className="text-xs">Watermark</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
