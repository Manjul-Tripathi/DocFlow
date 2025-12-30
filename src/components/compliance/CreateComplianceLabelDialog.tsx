import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Heart,
  CreditCard,
  Building2,
  Lock,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  AlertTriangle,
  Key,
  Download,
  Globe,
  FileText,
  Activity,
  Clock,
  Users
} from 'lucide-react';
import {
  ComplianceFramework,
  DataClassification,
  SensitivityLevel,
  DataCategory,
  COMPLIANCE_FRAMEWORKS,
  DATA_CLASSIFICATION_CONFIG,
  SENSITIVITY_LEVEL_CONFIG,
  DATA_CATEGORY_CONFIG,
  getRecommendedLabels
} from '@/types/compliance';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';

interface CreateComplianceLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LABEL_COLORS = [
  '#3B82F6', '#EF4444', '#22C55E', '#A855F7', '#F59E0B',
  '#06B6D4', '#EC4899', '#6366F1', '#14B8A6', '#F97316'
];

export const CreateComplianceLabelDialog: React.FC<CreateComplianceLabelDialogProps> = ({
  open,
  onOpenChange
}) => {
  const { createLabel, isLoading } = useComplianceLabels();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    framework: 'GDPR' as ComplianceFramework,
    description: '',
    color: LABEL_COLORS[0],
    data_classification: 'confidential' as DataClassification,
    sensitivity_level: 'medium' as SensitivityLevel,
    data_categories: [] as DataCategory[],
    retention_required: false,
    retention_period_days: 365,
    encryption_required: true,
    access_logging_required: true,
    watermark_required: false,
    download_restricted: false,
    sharing_restricted: false,
    export_restricted: false,
    deletion_requires_approval: false,
    geo_restrictions: [] as string[],
    audit_frequency_days: 90,
    requires_acknowledgment: false,
    acknowledgment_text: ''
  });

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleCreate = async () => {
    await createLabel({
      ...formData,
      icon: 'Shield',
      is_system_label: false,
      is_active: true
    });
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setStep(1);
    setFormData({
      name: '',
      code: '',
      framework: 'GDPR',
      description: '',
      color: LABEL_COLORS[0],
      data_classification: 'confidential',
      sensitivity_level: 'medium',
      data_categories: [],
      retention_required: false,
      retention_period_days: 365,
      encryption_required: true,
      access_logging_required: true,
      watermark_required: false,
      download_restricted: false,
      sharing_restricted: false,
      export_restricted: false,
      deletion_requires_approval: false,
      geo_restrictions: [],
      audit_frequency_days: 90,
      requires_acknowledgment: false,
      acknowledgment_text: ''
    });
  };

  const applyRecommendation = (recommendation: any) => {
    setFormData(prev => ({
      ...prev,
      name: recommendation.name || prev.name,
      code: recommendation.code || prev.code,
      data_classification: recommendation.data_classification || prev.data_classification,
      sensitivity_level: recommendation.sensitivity_level || prev.sensitivity_level
    }));
  };

  const toggleDataCategory = (category: DataCategory) => {
    setFormData(prev => ({
      ...prev,
      data_categories: prev.data_categories.includes(category)
        ? prev.data_categories.filter(c => c !== category)
        : [...prev.data_categories, category]
    }));
  };

  const recommendations = getRecommendedLabels(formData.framework);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Create Compliance Label</DialogTitle>
          <DialogDescription>
            Step {step} of {totalSteps} — 
            {step === 1 && ' Basic Information'}
            {step === 2 && ' Classification & Categories'}
            {step === 3 && ' Security Requirements'}
            {step === 4 && ' Review & Create'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="flex gap-1 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <ScrollArea className="max-h-[60vh] pr-4">
          {/* Step 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Compliance Framework</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-[300px] overflow-y-auto">
                    {(Object.entries(COMPLIANCE_FRAMEWORKS) as [ComplianceFramework, typeof COMPLIANCE_FRAMEWORKS[ComplianceFramework]][])
                      .map(([key, config]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, framework: key }))}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            formData.framework === key
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`h-6 w-6 rounded ${config.color} flex items-center justify-center text-white text-xs`}>
                              {config.name.charAt(0)}
                            </div>
                            <span className="font-medium text-sm">{config.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {config.description}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Recommended Labels</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recommendations.map((rec, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => applyRecommendation(rec)}
                          className="text-xs"
                        >
                          {rec.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Label Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., GDPR Personal Data"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="code">Label Code</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g., GDPR-PD"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe when this label should be applied..."
                    className="mt-1"
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Label Color</Label>
                  <div className="flex gap-2 mt-2">
                    {LABEL_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color }))}
                        className={`h-8 w-8 rounded-full transition-transform ${
                          formData.color === color ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Classification */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label>Data Classification</Label>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {(Object.entries(DATA_CLASSIFICATION_CONFIG) as [DataClassification, typeof DATA_CLASSIFICATION_CONFIG[DataClassification]][])
                    .map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, data_classification: key }))}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          formData.data_classification === key
                            ? `${config.borderColor} ${config.bgColor}`
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`font-medium ${config.color}`}>{config.label}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {config.description}
                            </p>
                          </div>
                          {formData.data_classification === key && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <Label>Sensitivity Level</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {(Object.entries(SENSITIVITY_LEVEL_CONFIG) as [SensitivityLevel, typeof SENSITIVITY_LEVEL_CONFIG[SensitivityLevel]][])
                    .map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, sensitivity_level: key }))}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          formData.sensitivity_level === key
                            ? `border-primary ${config.bgColor}`
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <span className={`font-medium text-sm ${config.color}`}>
                          {config.label}
                        </span>
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <Label>Data Categories</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select all categories that apply to this label
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(DATA_CATEGORY_CONFIG) as [DataCategory, typeof DATA_CATEGORY_CONFIG[DataCategory]][])
                    .map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDataCategory(key)}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          formData.data_categories.includes(key)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                            formData.data_categories.includes(key)
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground'
                          }`}>
                            {formData.data_categories.includes(key) && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-sm">{config.label}</span>
                            <p className="text-xs text-muted-foreground">{config.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Security Requirements */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Encryption Required</p>
                      <p className="text-xs text-muted-foreground">Documents must be encrypted at rest</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.encryption_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, encryption_required: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Access Logging Required</p>
                      <p className="text-xs text-muted-foreground">Log all access to labeled documents</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.access_logging_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, access_logging_required: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Watermark Required</p>
                      <p className="text-xs text-muted-foreground">Apply watermarks when viewing/downloading</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.watermark_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, watermark_required: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Restrict Downloads</p>
                      <p className="text-xs text-muted-foreground">Prevent users from downloading documents</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.download_restricted}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, download_restricted: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Restrict Sharing</p>
                      <p className="text-xs text-muted-foreground">Limit sharing capabilities for labeled documents</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.sharing_restricted}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, sharing_restricted: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Deletion Approval Required</p>
                      <p className="text-xs text-muted-foreground">Require approval before deleting documents</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.deletion_requires_approval}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, deletion_requires_approval: checked }))}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Retention Required</p>
                      <p className="text-xs text-muted-foreground">Enforce retention period for documents</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.retention_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, retention_required: checked }))}
                  />
                </div>

                {formData.retention_required && (
                  <div className="ml-8">
                    <Label htmlFor="retention">Retention Period (days)</Label>
                    <Input
                      id="retention"
                      type="number"
                      value={formData.retention_period_days}
                      onChange={(e) => setFormData(prev => ({ ...prev, retention_period_days: parseInt(e.target.value) || 365 }))}
                      className="mt-1 w-48"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      ≈ {Math.round(formData.retention_period_days / 365 * 10) / 10} years
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Require Acknowledgment</p>
                      <p className="text-xs text-muted-foreground">Users must acknowledge before accessing</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.requires_acknowledgment}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_acknowledgment: checked }))}
                  />
                </div>

                {formData.requires_acknowledgment && (
                  <div className="ml-8">
                    <Label htmlFor="ack-text">Acknowledgment Text</Label>
                    <Textarea
                      id="ack-text"
                      value={formData.acknowledgment_text}
                      onChange={(e) => setFormData(prev => ({ ...prev, acknowledgment_text: e.target.value }))}
                      placeholder="I acknowledge that I am authorized to access this document..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: formData.color }}
                  >
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{formData.name || 'Untitled Label'}</h3>
                    <p className="text-sm text-muted-foreground">{formData.code || 'No code'}</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                  {formData.description || 'No description provided'}
                </p>

                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge className={COMPLIANCE_FRAMEWORKS[formData.framework].color + ' text-white'}>
                    {COMPLIANCE_FRAMEWORKS[formData.framework].name}
                  </Badge>
                  <Badge variant="outline">
                    {DATA_CLASSIFICATION_CONFIG[formData.data_classification].label}
                  </Badge>
                  <Badge variant="outline">
                    {SENSITIVITY_LEVEL_CONFIG[formData.sensitivity_level].label} Sensitivity
                  </Badge>
                </div>

                {formData.data_categories.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Data Categories:</p>
                    <div className="flex flex-wrap gap-1">
                      {formData.data_categories.map(cat => (
                        <Badge key={cat} variant="secondary" className="text-xs">
                          {DATA_CATEGORY_CONFIG[cat].label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Security Requirements:</p>
                    <ul className="space-y-1">
                      {formData.encryption_required && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-500" /> Encryption
                        </li>
                      )}
                      {formData.access_logging_required && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-500" /> Access Logging
                        </li>
                      )}
                      {formData.watermark_required && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-500" /> Watermark
                        </li>
                      )}
                      {formData.download_restricted && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-500" /> Download Restricted
                        </li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Additional Settings:</p>
                    <ul className="space-y-1">
                      {formData.retention_required && (
                        <li className="text-sm">
                          Retention: {Math.round(formData.retention_period_days / 365)} years
                        </li>
                      )}
                      <li className="text-sm">
                        Audit Frequency: Every {formData.audit_frequency_days} days
                      </li>
                      {formData.requires_acknowledgment && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-500" /> Acknowledgment Required
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step < totalSteps ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={isLoading || !formData.name}>
                <Check className="h-4 w-4 mr-2" />
                Create Label
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
