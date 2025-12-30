import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  UserPlus,
  Mail,
  Link2,
  Copy,
  Send,
  Clock,
  Eye,
  Download,
  Shield,
  RefreshCw,
  XCircle,
  CheckCircle,
  Trash2,
  MoreHorizontal,
  Users,
  Activity,
  Globe,
  Lock,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useExternalSharing, ExternalShare, CreateExternalShareParams } from '@/hooks/useExternalSharing';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface ExternalSharingPanelProps {
  documents?: { id: string; file_name: string }[];
}

export function ExternalSharingPanel({ documents }: ExternalSharingPanelProps) {
  const {
    shares,
    loading,
    createShare,
    revokeShare,
    deleteShare,
    resendInvitation,
    getShareUrl,
    getShareStats,
  } = useExternalSharing();
  const { toast } = useToast();

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedShare, setSelectedShare] = useState<ExternalShare | null>(null);
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [formData, setFormData] = useState<CreateExternalShareParams>({
    resource_type: 'document',
    resource_id: '',
    resource_name: '',
    guest_email: '',
    guest_name: '',
    permission: 'view',
    allow_download: true,
    allow_print: true,
    expires_in_days: 7,
    message: '',
  });

  const stats = getShareStats();

  // Add email to list
  const addEmail = () => {
    const email = newEmailInput.trim();
    if (email && /\S+@\S+\.\S+/.test(email) && !guestEmails.includes(email)) {
      setGuestEmails(prev => [...prev, email]);
      setNewEmailInput('');
    }
  };

  // Remove email from list
  const removeEmail = (emailToRemove: string) => {
    setGuestEmails(prev => prev.filter(e => e !== emailToRemove));
  };

  // Handle Enter key to add email
  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    }
  };

  const handleInvite = async () => {
    if (guestEmails.length === 0 || !formData.resource_id) return;

    let successCount = 0;
    let failCount = 0;

    // Send invitations to all emails
    for (const email of guestEmails) {
      const shareParams = {
        ...formData,
        guest_email: email,
      };
      const share = await createShare(shareParams);
      if (share) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Show result toast
    if (successCount > 0) {
      toast({
        title: `✅ ${successCount} invitation${successCount > 1 ? 's' : ''} sent`,
        description: failCount > 0 ? `${failCount} failed to send` : undefined,
      });
    }

    // Reset form
    setShowInviteDialog(false);
    setGuestEmails([]);
    setNewEmailInput('');
    setFormData({
      resource_type: 'document',
      resource_id: '',
      resource_name: '',
      guest_email: '',
      guest_name: '',
      permission: 'view',
      allow_download: true,
      allow_print: true,
      expires_in_days: 7,
      message: '',
    });
  };

  const copyShareLink = async (share: ExternalShare) => {
    const url = getShareUrl(share);
    await navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Share link copied to clipboard.",
    });
  };

  const getStatusColor = (status: ExternalShare['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'accepted':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'revoked':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'expired':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getPermissionIcon = (permission: ExternalShare['permission']) => {
    switch (permission) {
      case 'view':
        return <Eye className="h-3 w-3" />;
      case 'download':
        return <Download className="h-3 w-3" />;
      case 'edit':
        return <Globe className="h-3 w-3" />;
      default:
        return <Eye className="h-3 w-3" />;
    }
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
          <h2 className="text-2xl font-bold text-foreground">External Sharing</h2>
          <p className="text-muted-foreground">Invite external users (guests) to access your documents</p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Guest
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active Shares</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalViews}</p>
                <p className="text-sm text-muted-foreground">Total Views</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.expired}</p>
                <p className="text-sm text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.revoked}</p>
                <p className="text-sm text-muted-foreground">Revoked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shares List */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="all">All Shares</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <SharesList
            shares={shares.filter(s => s.status === 'accepted' || s.status === 'pending')}
            onCopyLink={copyShareLink}
            onRevoke={revokeShare}
            onResend={resendInvitation}
            onDelete={deleteShare}
            getStatusColor={getStatusColor}
            getPermissionIcon={getPermissionIcon}
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <SharesList
            shares={shares.filter(s => s.status === 'pending')}
            onCopyLink={copyShareLink}
            onRevoke={revokeShare}
            onResend={resendInvitation}
            onDelete={deleteShare}
            getStatusColor={getStatusColor}
            getPermissionIcon={getPermissionIcon}
          />
        </TabsContent>

        <TabsContent value="expired" className="mt-4">
          <SharesList
            shares={shares.filter(s => s.status === 'expired')}
            onCopyLink={copyShareLink}
            onRevoke={revokeShare}
            onResend={resendInvitation}
            onDelete={deleteShare}
            getStatusColor={getStatusColor}
            getPermissionIcon={getPermissionIcon}
          />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <SharesList
            shares={shares}
            onCopyLink={copyShareLink}
            onRevoke={revokeShare}
            onResend={resendInvitation}
            onDelete={deleteShare}
            getStatusColor={getStatusColor}
            getPermissionIcon={getPermissionIcon}
          />
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite External Guest</DialogTitle>
            <DialogDescription>
              Share documents with external users who don't have an account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Document</Label>
              <Select
                value={formData.resource_id}
                onValueChange={v => {
                  const doc = documents?.find(d => d.id === v);
                  setFormData(prev => ({
                    ...prev,
                    resource_id: v,
                    resource_name: doc?.file_name || '',
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a document to share" />
                </SelectTrigger>
                <SelectContent>
                  {documents?.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.file_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Multi-email input */}
            <div className="space-y-2">
              <Label>Guest Emails *</Label>
              <div className="space-y-2">
                {/* Added emails as badges */}
                {guestEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
                    {guestEmails.map(email => (
                      <Badge key={email} variant="secondary" className="gap-1 pr-1">
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          className="ml-1 rounded-full hover:bg-muted p-0.5"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {/* Input for adding new emails */}
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={newEmailInput}
                    onChange={e => setNewEmailInput(e.target.value)}
                    onKeyDown={handleEmailKeyDown}
                    placeholder="guest@example.com (press Enter to add)"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    type="button"
                    onClick={addEmail}
                    disabled={!newEmailInput.trim() || !/\S+@\S+\.\S+/.test(newEmailInput)}
                  >
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {guestEmails.length} recipient{guestEmails.length !== 1 ? 's' : ''} added • Press Enter or comma to add
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Permission Level</Label>
                <Select
                  value={formData.permission}
                  onValueChange={v => {
                    const newPermission = v as 'view' | 'download' | 'edit';
                    setFormData(prev => ({
                      ...prev,
                      permission: newPermission,
                      // Sync allow_download with permission
                      allow_download: newPermission === 'download' || newPermission === 'edit'
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View Only</SelectItem>
                    <SelectItem value="download">Can Download</SelectItem>
                    <SelectItem value="edit">Can Edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expires In</Label>
                <Select
                  value={String(formData.expires_in_days || 0)}
                  onValueChange={v => setFormData(prev => ({ ...prev, expires_in_days: parseInt(v) || undefined }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="0">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className={formData.permission === 'view' ? 'text-muted-foreground' : ''}>
                    Allow Download
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {formData.permission === 'view'
                      ? 'Disabled for View Only permission'
                      : 'Guest can download the file'}
                  </p>
                </div>
                <Switch
                  checked={formData.allow_download}
                  onCheckedChange={checked => setFormData(prev => ({ ...prev, allow_download: checked }))}
                  disabled={formData.permission === 'view'}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Print</Label>
                  <p className="text-xs text-muted-foreground">Guest can print the document</p>
                </div>
                <Switch
                  checked={formData.allow_print}
                  onCheckedChange={checked => setFormData(prev => ({ ...prev, allow_print: checked }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Personal Message (optional)</Label>
              <Textarea
                value={formData.message || ''}
                onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Hi, I'd like to share this document with you..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={guestEmails.length === 0 || !formData.resource_id}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Send {guestEmails.length > 1 ? `${guestEmails.length} Invitations` : 'Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// SharesList component
function SharesList({
  shares,
  onCopyLink,
  onRevoke,
  onResend,
  onDelete,
  getStatusColor,
  getPermissionIcon,
}: {
  shares: ExternalShare[];
  onCopyLink: (share: ExternalShare) => void;
  onRevoke: (shareId: string) => void;
  onResend: (shareId: string) => void;
  onDelete: (shareId: string) => void;
  getStatusColor: (status: ExternalShare['status']) => string;
  getPermissionIcon: (permission: ExternalShare['permission']) => React.ReactNode;
}) {
  if (shares.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No External Shares</h3>
          <p className="text-muted-foreground text-center">
            Invite external users to collaborate on your documents.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {shares.map(share => (
        <Card key={share.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-muted">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{share.guest_email}</span>
                    {share.guest_name && (
                      <span className="text-sm text-muted-foreground">
                        ({share.guest_name})
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {share.resource_name || 'Unnamed document'}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {getPermissionIcon(share.permission)}
                      <span className="capitalize">{share.permission}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      <span>{share.view_count} views</span>
                    </div>
                    {share.expires_at && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Expires {formatDistanceToNow(new Date(share.expires_at), { addSuffix: true })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onCopyLink(share)}>
                  <Copy className="h-4 w-4" />
                </Button>
                {share.status === 'pending' && (
                  <Button variant="ghost" size="sm" onClick={() => onResend(share.id)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                {(share.status === 'pending' || share.status === 'accepted') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(share.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(share.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
