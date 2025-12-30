import React, { useState, useEffect } from 'react';
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
  Shield,
  Save,
  Trash2,
  AlertTriangle,
  Key,
  Activity,
  Download,
  Globe,
  FileText,
  Clock,
  Users
} from 'lucide-react';
import {
  ComplianceLabel,
  ComplianceFramework,
  DataClassification,
  SensitivityLevel,
  DataCategory,
  COMPLIANCE_FRAMEWORKS,
  DATA_CLASSIFICATION_CONFIG,
  SENSITIVITY_LEVEL_CONFIG,
  DATA_CATEGORY_CONFIG
} from '@/types/compliance';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';

interface EditComplianceLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: ComplianceLabel | null;
}

const LABEL_COLORS = [
  '#3B82F6', '#EF4444', '#22C55E', '#A855F7', '#F59E0B',
  '#06B6D4', '#EC4899', '#6366F1', '#14B8A6', '#F97316'
];

export const EditComplianceLabelDialog: React.FC<EditComplianceLabelDialogProps> = ({
  open,
  onOpenChange,
  label
}) => {
  const { updateLabel, deleteLabel, isLoading } = useComplianceLabels();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState<Partial<ComplianceLabel>>({});

  // Reset form when label changes
  useEffect(() => {
    if (label) {
      setFormData({
        name: label.name,
        code: label.code,
        framework: label.framework,
        description: label.description,
        color: label.color,
        data_classification: label.data_classification,
        sensitivity_level: label.sensitivity_level,
        data_categories: label.data_categories || [],
        retention_required: label.retention_required,
        retention_period_days: label.retention_period_days,
        encryption_required: label.encryption_required,
        access_logging_required: label.access_logging_required,
        watermark_required: label.watermark_required,
        download_restricted: label.download_restricted,
        sharing_restricted: label.sharing_restricted,
        export_restricted: label.export_restricted,
        deletion_requires_approval: label.deletion_requires_approval,
        audit_frequency_days: label.audit_frequency_days,
        requires_acknowledgment: label.requires_acknowledgment,
        acknowledgment_text: label.acknowledgment_text
      });
    }
  }, [label]);

  const handleSave = async () => {
    if (!label) return;
    await updateLabel(label.id, formData);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!label) return;
    await deleteLabel(label.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const toggleDataCategory = (category: DataCategory) => {
    const currentCategories = formData.data_categories || [];
    const newCategories = currentCategories.includes(category)
      ? currentCategories.filter(c => c !== category)
      : [...currentCategories, category];
    setFormData(prev => ({ ...prev, data_categories: newCategories }));
  };

  if (!label) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div 
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: formData.color || label.color }}
              >
                <Shield className="h-4 w-4" />
              </div>
              Edit Compliance Label
            </DialogTitle>
            <DialogDescription>
              Update the settings for {label.name}
              {label.is_system_label && (
                <Badge variant="secondary" className="ml-2">System Label</Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Basic Information
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Label Name</Label>
                    <Input
                      value={formData.name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., GDPR Personal Data"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input
                      value={formData.code || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g., GDPR-PD"
                      disabled={label.is_system_label}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this label is used for..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {LABEL_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          formData.color === color ? 'border-primary scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData(prev => ({ ...prev, color }))}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Classification */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Classification
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Classification</Label>
                    <Select
                      value={formData.data_classification}
                      onValueChange={(v) => setFormData(prev => ({ 
                        ...prev, 
                        data_classification: v as DataClassification 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DATA_CLASSIFICATION_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <span className={config.color}>{config.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Sensitivity Level</Label>
                    <Select
                      value={formData.sensitivity_level}
                      onValueChange={(v) => setFormData(prev => ({ 
                        ...prev, 
                        sensitivity_level: v as SensitivityLevel 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SENSITIVITY_LEVEL_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <span className={config.color}>{config.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Data Categories</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(DATA_CATEGORY_CONFIG).map(([key, config]) => (
                      <Badge
                        key={key}
                        variant={formData.data_categories?.includes(key as DataCategory) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleDataCategory(key as DataCategory)}
                      >
                        {config.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Security Requirements */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Security Requirements
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Encryption Required</span>
                    </div>
                    <Switch
                      checked={formData.encryption_required}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        encryption_required: checked 
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Access Logging</span>
                    </div>
                    <Switch
                      checked={formData.access_logging_required}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        access_logging_required: checked 
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Watermark Required</span>
                    </div>
                    <Switch
                      checked={formData.watermark_required}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        watermark_required: checked 
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Download Restricted</span>
                    </div>
                    <Switch
                      checked={formData.download_restricted}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        download_restricted: checked 
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Sharing Restricted</span>
                    </div>
                    <Switch
                      checked={formData.sharing_restricted}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        sharing_restricted: checked 
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Deletion Approval</span>
                    </div>
                    <Switch
                      checked={formData.deletion_requires_approval}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        deletion_requires_approval: checked 
                      }))}
                    />
                  </div>
                </div>
              </div>

              {/* Retention & Audit */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Retention & Audit
                </h3>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <span className="text-sm font-medium">Retention Required</span>
                    <p className="text-xs text-muted-foreground">Enforce data retention period</p>
                  </div>
                  <Switch
                    checked={formData.retention_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      retention_required: checked 
                    }))}
                  />
                </div>

                {formData.retention_required && (
                  <div className="space-y-2">
                    <Label>Retention Period (days)</Label>
                    <Input
                      type="number"
                      value={formData.retention_period_days || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        retention_period_days: parseInt(e.target.value) || undefined 
                      }))}
                      min={1}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Audit Frequency (days)</Label>
                  <Input
                    type="number"
                    value={formData.audit_frequency_days || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      audit_frequency_days: parseInt(e.target.value) || 90 
                    }))}
                    min={1}
                  />
                </div>
              </div>

              {/* Acknowledgment */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  User Acknowledgment
                </h3>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <span className="text-sm font-medium">Requires Acknowledgment</span>
                    <p className="text-xs text-muted-foreground">Users must acknowledge before accessing</p>
                  </div>
                  <Switch
                    checked={formData.requires_acknowledgment}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      requires_acknowledgment: checked 
                    }))}
                  />
                </div>

                {formData.requires_acknowledgment && (
                  <div className="space-y-2">
                    <Label>Acknowledgment Text</Label>
                    <Textarea
                      value={formData.acknowledgment_text || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        acknowledgment_text: e.target.value 
                      }))}
                      placeholder="I acknowledge that I understand the compliance requirements..."
                      rows={3}
                    />
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="flex justify-between">
            <div>
              {!label.is_system_label && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Label
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Compliance Label?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{label.name}" label. 
              Documents with this label will lose their compliance classification.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Label
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
