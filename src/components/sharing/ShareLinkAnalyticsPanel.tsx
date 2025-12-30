import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ArrowLeft,
  Copy,
  Check,
  Eye,
  Download,
  Edit,
  MessageSquare,
  Lock,
  Clock,
  Users,
  Mail,
  ExternalLink,
  Trash2,
  Pause,
  Play,
  BarChart3,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  QrCode,
  Settings,
  TrendingUp,
  MapPin,
  Calendar
} from 'lucide-react';
import type { EnhancedShareLink, ShareLinkPermission } from '@/types/shareLink';
import { SHARE_LINK_PERMISSION_INFO, generateShareUrl, generateQRCodeUrl } from '@/types/shareLink';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { getAccessLogsForLink } from '@/utils/shareLinkStorage';

interface ShareLinkAnalyticsPanelProps {
  link: EnhancedShareLink;
  onBack: () => void;
  onUpdate: (linkId: string, updates: Partial<EnhancedShareLink>) => Promise<boolean>;
  onRevoke: (linkId: string) => Promise<boolean>;
  onDelete: (linkId: string) => Promise<boolean>;
}

export const ShareLinkAnalyticsPanel: React.FC<ShareLinkAnalyticsPanelProps> = ({
  link,
  onBack,
  onUpdate,
  onRevoke,
  onDelete
}) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Local state for settings to make UI update immediately
  const [settings, setSettings] = useState({
    permission: link.permission,
    allow_download: link.allow_download,
    allow_print: link.allow_print,
    allow_copy: link.allow_copy,
    watermark_enabled: link.watermark_enabled,
    notify_on_access: link.notify_on_access,
    password_protected: link.password_protected,
    password: '', // Don't show existing password, just empty for setting new one
    expires_at: link.expires_at || ''
  });

  // State for editing password
  const [showPasswordInput, setShowPasswordInput] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');

  // State for editing expiration
  const [showExpirationInput, setShowExpirationInput] = React.useState(false);

  // Sync local state when link prop changes
  useEffect(() => {
    setSettings({
      permission: link.permission,
      allow_download: link.allow_download,
      allow_print: link.allow_print,
      allow_copy: link.allow_copy,
      watermark_enabled: link.watermark_enabled,
      notify_on_access: link.notify_on_access,
      password_protected: link.password_protected,
      password: '',
      expires_at: link.expires_at || ''
    });
  }, [link]);

  // Helper to update a setting
  const updateSetting = async (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await onUpdate(link.id, { [key]: value });
  };

  const shareUrl = generateShareUrl(link.token);
  const qrUrl = generateQRCodeUrl(shareUrl, 200);

  // Download QR code as image
  const downloadQR = async () => {
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${link.resource_name || 'share-link'}-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download QR:', err);
      // Fallback: open in new tab
      window.open(qrUrl, '_blank');
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Link copied',
      description: 'Share link copied to clipboard'
    });
  };

  const getPermissionIcon = (perm: ShareLinkPermission) => {
    switch (perm) {
      case 'view': return <Eye className="w-4 h-4" />;
      case 'download': return <Download className="w-4 h-4" />;
      case 'edit': return <Edit className="w-4 h-4" />;
    }
  };

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case 'desktop': return <Monitor className="w-4 h-4" />;
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  // Get access logs for this link
  const accessLogs = getAccessLogsForLink(link.id);

  // State for backend data (device breakdown and view counts)
  const [backendDeviceData, setBackendDeviceData] = React.useState<{ Desktop: number, Mobile: number, Tablet: number } | null>(null);
  const [backendStats, setBackendStats] = React.useState<{ total_views: number, downloads: number, unique_visitors: number } | null>(null);

  // Fetch device breakdown and stats from backend on mount and periodically
  React.useEffect(() => {
    const fetchBackendData = async () => {
      try {
        const response = await fetch(`/api/shares/access-logs-public/${link.id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.device_breakdown) {
            setBackendDeviceData(data.device_breakdown);
          }
          if (data.total_views !== undefined) {
            setBackendStats({
              total_views: data.total_views,
              downloads: data.downloads || 0,
              unique_visitors: data.unique_visitors || 0
            });
          }
        }
      } catch (err) {
        console.log('Failed to fetch backend data:', err);
      }
    };

    fetchBackendData();

    // Refresh every 10 seconds to catch cross-device updates
    const interval = setInterval(fetchBackendData, 10000);
    return () => clearInterval(interval);
  }, [link.id]);

  // Calculate device breakdown - prioritize backend data over local logs
  const calculateDeviceBreakdown = () => {
    // Use backend data if available
    if (backendDeviceData && (backendDeviceData.Desktop + backendDeviceData.Mobile + backendDeviceData.Tablet) > 0) {
      return [
        { device: 'Desktop', views: backendDeviceData.Desktop },
        { device: 'Mobile', views: backendDeviceData.Mobile },
        { device: 'Tablet', views: backendDeviceData.Tablet }
      ];
    }

    // Fallback to local access logs
    if (accessLogs && accessLogs.length > 0) {
      const breakdown = { Desktop: 0, Mobile: 0, Tablet: 0 };
      accessLogs.forEach((log: any) => {
        const deviceType = log.device_type || 'Desktop';
        if (deviceType in breakdown) {
          breakdown[deviceType as keyof typeof breakdown]++;
        } else {
          breakdown.Desktop++; // Default to Desktop
        }
      });
      return [
        { device: 'Desktop', views: breakdown.Desktop },
        { device: 'Mobile', views: breakdown.Mobile },
        { device: 'Tablet', views: breakdown.Tablet }
      ];
    }

    // Fallback: When use_count is low, assign all views to Desktop
    const useCount = link.use_count || 0;
    if (useCount <= 2) {
      return [
        { device: 'Desktop', views: useCount },
        { device: 'Mobile', views: 0 },
        { device: 'Tablet', views: 0 }
      ];
    }
    // For higher counts, use distribution
    return [
      { device: 'Desktop', views: Math.ceil(useCount * 0.6) },
      { device: 'Mobile', views: Math.floor(useCount * 0.3) },
      { device: 'Tablet', views: Math.floor(useCount * 0.1) }
    ];
  };

  // Combine local and backend data for the most accurate stats
  const analytics = link.analytics || {
    // Use the higher of backend or local view count (in case of sync issues)
    total_views: Math.max(backendStats?.total_views || 0, link.use_count || 0),
    unique_visitors: Math.max(backendStats?.unique_visitors || 0, link.unique_visitor_ids?.length || (link.use_count > 0 ? 1 : 0)),
    download_count: Math.max(backendStats?.downloads || 0, link.download_count || 0),
    avg_view_duration_seconds: 120,
    views_by_date: [],
    views_by_country: [],
    views_by_device: calculateDeviceBreakdown(),
    recent_accesses: accessLogs
  };

  const isActive = link.is_active && (!link.expires_at || new Date(link.expires_at) > new Date());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{link.name || link.resource_name || 'Share Link'}</h2>
          <p className="text-muted-foreground text-sm">
            Created {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <Badge variant="default" className="bg-green-500">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
          <Button variant="outline" onClick={copyLink}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            Copy Link
          </Button>
          <Button variant="outline" onClick={() => window.open(shareUrl, '_blank')}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Eye className="w-4 h-4" />
                  <span className="text-sm">Total Views</span>
                </div>
                <p className="text-2xl font-bold">{analytics.total_views}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Unique Visitors</span>
                </div>
                <p className="text-2xl font-bold">{analytics.unique_visitors}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Download className="w-4 h-4" />
                  <span className="text-sm">Downloads</span>
                </div>
                <p className="text-2xl font-bold">{analytics.download_count}</p>
              </CardContent>
            </Card>
          </div>

          {/* Device Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Device Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.views_by_device.map((item) => {
                  const percentage = analytics.total_views > 0
                    ? (item.views / analytics.total_views) * 100
                    : 0;
                  return (
                    <div key={item.device} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getDeviceIcon(item.device)}
                          <span className="font-medium">{item.device}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {item.views} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Geographic Distribution */}
          {analytics.views_by_country.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Geographic Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.views_by_country.map((item) => {
                    const percentage = analytics.total_views > 0
                      ? (item.views / analytics.total_views) * 100
                      : 0;
                    return (
                      <div key={item.country} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span>{item.country}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={percentage} className="w-24 h-2" />
                          <span className="text-muted-foreground w-16 text-right">
                            {item.views} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Access History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recent Access History
              </CardTitle>
              <CardDescription>
                Who accessed this document
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.recent_accesses && analytics.recent_accesses.length > 0 ? (
                <div className="space-y-3">
                  {analytics.recent_accesses.slice(0, 10).map((access: any) => (
                    <div key={access.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-full">
                          {access.device_type === 'Mobile' ? (
                            <Smartphone className="w-4 h-4 text-muted-foreground" />
                          ) : access.device_type === 'Tablet' ? (
                            <Tablet className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Monitor className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {access.accessor_email || 'Anonymous Visitor'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {access.action === 'download' ? 'Downloaded' : access.action === 'print' ? 'Printed' : 'Viewed'} • {access.device_type || 'Unknown device'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(access.accessed_at), { addSuffix: true })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(access.accessed_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No access history yet</p>
                  <p className="text-sm">Views will appear here when someone accesses this link</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Details & QR */}
        <div className="space-y-6">
          {/* QR Code */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="w-4 h-4" />
                QR Code
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <img
                src={qrUrl}
                alt="QR Code"
                className="w-[160px] h-[160px] rounded-lg border mb-4"
              />
              <Button variant="outline" size="sm" className="w-full" onClick={downloadQR}>
                <Download className="w-4 h-4 mr-2" />
                Download QR
              </Button>
            </CardContent>
          </Card>

          {/* Link Details - Editable Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Link Settings
              </CardTitle>
              <CardDescription>Click toggles to update settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Permission - Editable Dropdown */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Permission</Label>
                  <p className="text-xs text-muted-foreground">What users can do with this link</p>
                </div>
                <Select
                  value={settings.permission}
                  onValueChange={(value: ShareLinkPermission) => {
                    updateSetting('permission', value);
                    // Also update allow_download based on permission
                    if (value === 'download' || value === 'edit') {
                      updateSetting('allow_download', true);
                    } else if (value === 'view') {
                      updateSetting('allow_download', false);
                    }
                    toast({
                      title: 'Permission updated',
                      description: `Changed to ${SHARE_LINK_PERMISSION_INFO[value].label}`
                    });
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        View Only
                      </div>
                    </SelectItem>
                    <SelectItem value="download">
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Can Download
                      </div>
                    </SelectItem>
                    <SelectItem value="edit">
                      <div className="flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        Can Edit
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Password - Editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="password-protected" className="cursor-pointer">Password Protection</Label>
                    <p className="text-xs text-muted-foreground">Require password to access</p>
                  </div>
                  <Switch
                    id="password-protected"
                    checked={settings.password_protected}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        // Remove password
                        updateSetting('password_protected', false);
                        updateSetting('password_hash', null);
                        setShowPasswordInput(false);
                        setNewPassword('');
                        toast({ title: 'Password removed' });
                      } else {
                        setShowPasswordInput(true);
                      }
                    }}
                  />
                </div>
                {showPasswordInput && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="4-8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value.slice(0, 8))}
                        maxLength={8}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={newPassword.length < 4 || newPassword.length > 8}
                        onClick={() => {
                          if (newPassword.length >= 4 && newPassword.length <= 8) {
                            updateSetting('password_protected', true);
                            updateSetting('password_hash', newPassword);
                            setShowPasswordInput(false);
                            setNewPassword('');
                            setSettings(prev => ({ ...prev, password_protected: true }));
                            toast({ title: 'Password set successfully' });
                          } else if (newPassword.length < 4) {
                            toast({ title: 'Password too short', description: 'Minimum 4 characters', variant: 'destructive' });
                          } else {
                            toast({ title: 'Password too long', description: 'Maximum 8 characters', variant: 'destructive' });
                          }
                        }}
                      >
                        Set
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowPasswordInput(false);
                          setNewPassword('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className={`text-xs ${newPassword.length >= 4 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {newPassword.length}/8 characters {newPassword.length < 4 && '(min 4)'}
                    </p>
                  </div>
                )}
                {settings.password_protected && !showPasswordInput && (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="gap-1">
                      <Lock className="w-3 h-3" />
                      Protected
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setShowPasswordInput(true)}>
                      Change
                    </Button>
                  </div>
                )}
              </div>

              {/* Expiration - Editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="has-expiration" className="cursor-pointer">Link Expiration</Label>
                    <p className="text-xs text-muted-foreground">Set when link expires</p>
                  </div>
                  <Switch
                    id="has-expiration"
                    checked={!!settings.expires_at}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        // Remove expiration
                        updateSetting('expires_at', null);
                        setSettings(prev => ({ ...prev, expires_at: '' }));
                        toast({ title: 'Expiration removed', description: 'Link will not expire' });
                      } else {
                        // Set default expiration to 7 days from now
                        const defaultExpiry = new Date();
                        defaultExpiry.setDate(defaultExpiry.getDate() + 7);
                        const expiryStr = defaultExpiry.toISOString();
                        updateSetting('expires_at', expiryStr);
                        setSettings(prev => ({ ...prev, expires_at: expiryStr }));
                        toast({ title: 'Expiration set', description: 'Expires in 7 days' });
                      }
                    }}
                  />
                </div>
                {settings.expires_at && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={settings.expires_at ? new Date(settings.expires_at).toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value);
                        newDate.setHours(23, 59, 59);
                        const expiryStr = newDate.toISOString();
                        updateSetting('expires_at', expiryStr);
                        setSettings(prev => ({ ...prev, expires_at: expiryStr }));
                        toast({ title: 'Expiration updated', description: `Expires on ${format(newDate, 'MMM d, yyyy')}` });
                      }}
                      className="w-[160px]"
                    />
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(settings.expires_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>

              {link.max_uses && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Usage Limit</span>
                  <span>{link.use_count} / {link.max_uses}</span>
                </div>
              )}

              <Separator />

              {/* Editable Settings */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-download" className="cursor-pointer">Allow Download</Label>
                  <p className="text-xs text-muted-foreground">Users can download the document</p>
                </div>
                <Switch
                  id="allow-download"
                  checked={settings.allow_download}
                  onCheckedChange={(checked) => {
                    updateSetting('allow_download', checked);
                    toast({
                      title: checked ? 'Download enabled' : 'Download disabled',
                      description: 'Link settings updated'
                    });
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-print" className="cursor-pointer">Allow Print</Label>
                  <p className="text-xs text-muted-foreground">Users can print the document</p>
                </div>
                <Switch
                  id="allow-print"
                  checked={settings.allow_print}
                  onCheckedChange={(checked) => {
                    updateSetting('allow_print', checked);
                    toast({
                      title: checked ? 'Printing enabled' : 'Printing disabled',
                      description: 'Link settings updated'
                    });
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-copy" className="cursor-pointer">Allow Copy</Label>
                  <p className="text-xs text-muted-foreground">Users can copy text from document</p>
                </div>
                <Switch
                  id="allow-copy"
                  checked={settings.allow_copy}
                  onCheckedChange={(checked) => {
                    updateSetting('allow_copy', checked);
                    toast({
                      title: checked ? 'Copying enabled' : 'Copying disabled',
                      description: 'Link settings updated'
                    });
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="watermark" className="cursor-pointer">Watermark</Label>
                  <p className="text-xs text-muted-foreground">Apply watermark to downloads</p>
                </div>
                <Switch
                  id="watermark"
                  checked={settings.watermark_enabled}
                  onCheckedChange={(checked) => {
                    updateSetting('watermark_enabled', checked);
                    toast({
                      title: checked ? 'Watermark enabled' : 'Watermark disabled',
                      description: 'Link settings updated'
                    });
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notify" className="cursor-pointer">Notify on Access</Label>
                  <p className="text-xs text-muted-foreground">Get notified when link is accessed</p>
                </div>
                <Switch
                  id="notify"
                  checked={settings.notify_on_access}
                  onCheckedChange={(checked) => {
                    updateSetting('notify_on_access', checked);
                    toast({
                      title: checked ? 'Notifications enabled' : 'Notifications disabled',
                      description: 'Link settings updated'
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent className="p-4 space-y-2">
              {isActive ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onRevoke(link.id)}
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Revoke Link
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onUpdate(link.id, { is_active: true })}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Reactivate Link
                </Button>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={async () => {
                  await onDelete(link.id);
                  onBack();
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Permanently
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
