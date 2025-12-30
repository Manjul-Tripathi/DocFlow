import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  Bell,
  Mail,
  AlertTriangle,
  Clock,
  Shield,
  FileWarning,
  Users,
  Plus,
  Trash2,
  Save,
  TestTube,
  CheckCircle2,
  XCircle,
  Info,
  Calendar,
  Settings
} from 'lucide-react';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import { COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { toast } from 'sonner';

interface NotificationSetting {
  id: string;
  event_type: 'violation_created' | 'violation_resolved' | 'label_applied' | 'label_removed' | 'review_due' | 'expiration_warning' | 'policy_update';
  enabled: boolean;
  recipients: string[];
  include_admins: boolean;
  include_document_owner: boolean;
  frequency: 'immediate' | 'daily_digest' | 'weekly_digest';
  framework_filter?: string[];
}

interface NotificationRecipient {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'compliance_officer' | 'manager' | 'custom';
  is_active: boolean;
}

const eventTypeConfig: Record<string, { label: string; icon: React.ReactNode; description: string; severity: 'high' | 'medium' | 'low' }> = {
  violation_created: {
    label: 'New Violation',
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'When a compliance violation is detected',
    severity: 'high'
  },
  violation_resolved: {
    label: 'Violation Resolved',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'When a violation is marked as resolved',
    severity: 'low'
  },
  label_applied: {
    label: 'Label Applied',
    icon: <Shield className="h-4 w-4" />,
    description: 'When a compliance label is added to a document',
    severity: 'low'
  },
  label_removed: {
    label: 'Label Removed',
    icon: <FileWarning className="h-4 w-4" />,
    description: 'When a compliance label is removed from a document',
    severity: 'medium'
  },
  review_due: {
    label: 'Review Due',
    icon: <Clock className="h-4 w-4" />,
    description: 'Reminder for upcoming compliance reviews',
    severity: 'medium'
  },
  expiration_warning: {
    label: 'Expiration Warning',
    icon: <Calendar className="h-4 w-4" />,
    description: 'Warning before label or policy expiration',
    severity: 'medium'
  },
  policy_update: {
    label: 'Policy Update',
    icon: <Settings className="h-4 w-4" />,
    description: 'When compliance policies are updated',
    severity: 'low'
  }
};

const severityColors = {
  high: 'text-red-500 bg-red-500/10',
  medium: 'text-yellow-500 bg-yellow-500/10',
  low: 'text-green-500 bg-green-500/10'
};

export const ComplianceNotificationSettings: React.FC = () => {
  const { labels } = useComplianceLabels();
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [isAddRecipientOpen, setIsAddRecipientOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState({ email: '', name: '', role: 'custom' as const });
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Initialize default settings
  useEffect(() => {
    // Default notification settings
    setSettings([
      {
        id: '1',
        event_type: 'violation_created',
        enabled: true,
        recipients: ['admin@company.com', 'compliance@company.com'],
        include_admins: true,
        include_document_owner: true,
        frequency: 'immediate'
      },
      {
        id: '2',
        event_type: 'violation_resolved',
        enabled: true,
        recipients: [],
        include_admins: true,
        include_document_owner: true,
        frequency: 'daily_digest'
      },
      {
        id: '3',
        event_type: 'label_applied',
        enabled: false,
        recipients: [],
        include_admins: false,
        include_document_owner: true,
        frequency: 'daily_digest'
      },
      {
        id: '4',
        event_type: 'label_removed',
        enabled: true,
        recipients: ['compliance@company.com'],
        include_admins: true,
        include_document_owner: true,
        frequency: 'immediate'
      },
      {
        id: '5',
        event_type: 'review_due',
        enabled: true,
        recipients: [],
        include_admins: false,
        include_document_owner: true,
        frequency: 'daily_digest'
      },
      {
        id: '6',
        event_type: 'expiration_warning',
        enabled: true,
        recipients: ['compliance@company.com'],
        include_admins: true,
        include_document_owner: false,
        frequency: 'daily_digest'
      },
      {
        id: '7',
        event_type: 'policy_update',
        enabled: true,
        recipients: [],
        include_admins: true,
        include_document_owner: false,
        frequency: 'immediate'
      }
    ]);

    // Default recipients
    setRecipients([
      { id: '1', email: 'admin@company.com', name: 'System Admin', role: 'admin', is_active: true },
      { id: '2', email: 'compliance@company.com', name: 'Compliance Team', role: 'compliance_officer', is_active: true },
      { id: '3', email: 'legal@company.com', name: 'Legal Department', role: 'manager', is_active: true }
    ]);

    setLastSaved(new Date(Date.now() - 86400000)); // Yesterday
  }, []);

  const handleSettingChange = (settingId: string, field: keyof NotificationSetting, value: any) => {
    setSettings(prev => prev.map(s => 
      s.id === settingId ? { ...s, [field]: value } : s
    ));
  };

  const handleAddRecipient = () => {
    if (!newRecipient.email || !newRecipient.name) {
      toast.error('Please fill in all fields');
      return;
    }
    
    const recipient: NotificationRecipient = {
      id: `recipient-${Date.now()}`,
      ...newRecipient,
      is_active: true
    };
    
    setRecipients(prev => [...prev, recipient]);
    setNewRecipient({ email: '', name: '', role: 'custom' });
    setIsAddRecipientOpen(false);
    toast.success('Recipient added');
  };

  const handleRemoveRecipient = (recipientId: string) => {
    setRecipients(prev => prev.filter(r => r.id !== recipientId));
    toast.success('Recipient removed');
  };

  const handleToggleRecipient = (recipientId: string) => {
    setRecipients(prev => prev.map(r => 
      r.id === recipientId ? { ...r, is_active: !r.is_active } : r
    ));
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLastSaved(new Date());
      toast.success('Notification settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async (eventType: string) => {
    toast.info(`Sending test notification for ${eventTypeConfig[eventType].label}...`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    toast.success('Test notification sent');
  };

  const enabledCount = settings.filter(s => s.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure email notifications for compliance events
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-muted-foreground">
              Last saved: {lastSaved.toLocaleString()}
            </span>
          )}
          <Button onClick={handleSaveSettings} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {/* Global Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                globalEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium">Email Notifications</h3>
                <p className="text-sm text-muted-foreground">
                  {globalEnabled ? `${enabledCount} notification types active` : 'All notifications paused'}
                </p>
              </div>
            </div>
            <Switch
              checked={globalEnabled}
              onCheckedChange={setGlobalEnabled}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Notification Types */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Event Notifications</CardTitle>
              <CardDescription>
                Choose which events trigger email notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {settings.map((setting) => {
                    const config = eventTypeConfig[setting.event_type];
                    const isDisabled = !globalEnabled;
                    
                    return (
                      <div
                        key={setting.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          isDisabled ? 'opacity-50' : ''
                        } ${setting.enabled ? 'bg-card' : 'bg-muted/30'}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3">
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${severityColors[config.severity]}`}>
                              {config.icon}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{config.label}</h4>
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    config.severity === 'high' ? 'border-red-500 text-red-500' :
                                    config.severity === 'medium' ? 'border-yellow-500 text-yellow-500' :
                                    'border-green-500 text-green-500'
                                  }`}
                                >
                                  {config.severity} priority
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {config.description}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={setting.enabled}
                            onCheckedChange={(checked) => handleSettingChange(setting.id, 'enabled', checked)}
                            disabled={isDisabled}
                          />
                        </div>

                        {setting.enabled && !isDisabled && (
                          <div className="pl-12 space-y-3">
                            <div className="flex flex-wrap gap-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`${setting.id}-admins`}
                                  checked={setting.include_admins}
                                  onChange={(e) => handleSettingChange(setting.id, 'include_admins', e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <Label htmlFor={`${setting.id}-admins`} className="text-sm">
                                  Notify admins
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`${setting.id}-owner`}
                                  checked={setting.include_document_owner}
                                  onChange={(e) => handleSettingChange(setting.id, 'include_document_owner', e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <Label htmlFor={`${setting.id}-owner`} className="text-sm">
                                  Notify document owner
                                </Label>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <Select
                                value={setting.frequency}
                                onValueChange={(v) => handleSettingChange(setting.id, 'frequency', v)}
                              >
                                <SelectTrigger className="w-40 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="immediate">Immediate</SelectItem>
                                  <SelectItem value="daily_digest">Daily Digest</SelectItem>
                                  <SelectItem value="weekly_digest">Weekly Digest</SelectItem>
                                </SelectContent>
                              </Select>
                              
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleTestNotification(setting.event_type)}
                              >
                                <TestTube className="h-3 w-3 mr-1" />
                                Test
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Recipients */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Recipients
                  </CardTitle>
                  <CardDescription>
                    Manage notification recipients
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsAddRecipientOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {recipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        recipient.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                            {recipient.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{recipient.name}</p>
                            <p className="text-xs text-muted-foreground">{recipient.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={recipient.is_active}
                            onCheckedChange={() => handleToggleRecipient(recipient.id)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRemoveRecipient(recipient.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <Badge variant="outline" className="mt-2 text-xs">
                        {recipient.role.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Email Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="font-semibold">SimplifyAI DocFlow</span>
                </div>
                <div className="space-y-2 text-xs">
                  <p className="font-medium">Subject: Compliance Alert - New Violation Detected</p>
                  <Separator />
                  <p className="text-muted-foreground">
                    A new compliance violation has been detected in your workspace.
                  </p>
                  <div className="p-2 rounded bg-muted">
                    <p><strong>Document:</strong> financial_report.pdf</p>
                    <p><strong>Framework:</strong> SOX</p>
                    <p><strong>Severity:</strong> High</p>
                  </div>
                  <Button size="sm" className="w-full mt-2">
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Recipient Dialog */}
      <Dialog open={isAddRecipientOpen} onOpenChange={setIsAddRecipientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Notification Recipient</DialogTitle>
            <DialogDescription>
              Add a new email recipient for compliance notifications
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newRecipient.name}
                onChange={(e) => setNewRecipient(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={newRecipient.email}
                onChange={(e) => setNewRecipient(prev => ({ ...prev, email: e.target.value }))}
                placeholder="e.g., john@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newRecipient.role}
                onValueChange={(v) => setNewRecipient(prev => ({ ...prev, role: v as NotificationRecipient['role'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="compliance_officer">Compliance Officer</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddRecipientOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRecipient}>
              Add Recipient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
