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
  TrendingUp,
  Share2,
} from 'lucide-react';
import { useExternalSharing, ExternalShare, CreateExternalShareParams } from '@/hooks/useExternalSharing';
import { useShareStats } from '@/hooks/useShareStats';
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

  const { stats, loading: statsLoading } = useShareStats();
  const { toast } = useToast();

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedShare, setSelectedShare] = useState<ExternalShare | null>(null);
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

  const handleInvite = async () => {
    if (!formData.guest_email || !formData.resource_id) return;

    const share = await createShare(formData);
    if (share) {
      setShowInviteDialog(false);
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
    }
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
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getPermissionIcon = (permission: ExternalShare['permission']) => {
    switch (permission) {
      case 'view':
        return <Eye className="h-4 w-4" />;
      case 'download':
        return <Download className="h-4 w-4" />;
      case 'edit':
        return <Shield className="h-4 w-4" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Active Shares */}
        <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-400 flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Active Shares
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.active_shares}
            </div>
            <p className="text-xs text-gray-400 mt-1">Currently active shares</p>
          </CardContent>
        </Card>

        {/* Total Views */}
        <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-400 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Total Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.total_views}
            </div>
            <p className="text-xs text-gray-400 mt-1">All guest views</p>
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.pending_invitations}
            </div>
            <p className="text-xs text-gray-400 mt-1">Awaiting acceptance</p>
          </CardContent>
        </Card>

        {/* Expired Shares */}
        <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.expired_shares}
            </div>
            <p className="text-xs text-gray-400 mt-1">Links no longer valid</p>
          </CardContent>
        </Card>

        {/* Revoked Shares */}
        <Card className="border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Revoked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.revoked_shares}
            </div>
            <p className="text-xs text-gray-400 mt-1">Cancelled by you</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card className="border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Manage Guest Shares</CardTitle>
          <Button onClick={() => setShowInviteDialog(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Invite Guest
          </Button>
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
          {/* Tabs for different share statuses */}
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="active" className="flex items-center gap-2">
                <Activity className="h-3 w-3" />
                <span className="hidden sm:inline">Active</span>
                <Badge variant="outline" className="ml-1">
                  {shares.filter(s => s.status === 'pending' || s.status === 'accepted').length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span className="hidden sm:inline">Pending</span>
                <Badge variant="outline" className="ml-1">
                  {shares.filter(s => s.status === 'pending').length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="accepted" className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3" />
                <span className="hidden sm:inline">Accepted</span>
                <Badge variant="outline" className="ml-1">
                  {shares.filter(s => s.status === 'accepted').length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="expired" className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" />
                <span className="hidden sm:inline">Expired</span>
                <Badge variant="outline" className="ml-1">
                  {shares.filter(s => s.status === 'expired').length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Users className="h-3 w-3" />
                <span className="hidden sm:inline">All</span>
                <Badge variant="outline" className="ml-1">
                  {shares.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Tab Content */}
            <TabsContent value="active" className="mt-4">
              <SharesList
                shares={shares.filter(s => s.status === 'pending' || s.status === 'accepted')}
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

            <TabsContent value="accepted" className="mt-4">
              <SharesList
                shares={shares.filter(s => s.status === 'accepted')}
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

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          )}

          {!loading && shares.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-gray-500 mb-4" />
              <p className="text-gray-400">No guest shares yet. Create one to get started!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite External Guest</DialogTitle>
            <DialogDescription>
              Share documents with external users who don't have a DocFlow account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Document Selection */}
            <div className="space-y-2">
              <Label>Document</Label>
              <Select
                value={formData.resource_id}
                onValueChange={v => {
                  const doc = documents?.find(d => d.id === v);
                  setFormData(prev => ({
                    ...prev,
                    resource_id: v,
                    resource_name: doc?.file_name || ''
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a document" />
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

            {/* Email and Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Guest Email *</Label>
                <Input
                  type="email"
                  value={formData.guest_email}
                  onChange={e => setFormData(prev => ({ ...prev, guest_email: e.target.value }))}
                  placeholder="guest@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Guest Name</Label>
                <Input
                  value={formData.guest_name || ''}
                  onChange={e => setFormData(prev => ({ ...prev, guest_name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
            </div>

            {/* Permission Level */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Permission Level</Label>
                <Select
                  value={formData.permission}
                  onValueChange={v => setFormData(prev => ({ ...prev, permission: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">👁️ View Only</SelectItem>
                    <SelectItem value="download">⬇️ Can Download</SelectItem>
                    <SelectItem value="edit">✏️ Can Edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expires In (Days)</Label>
                <Select
                  value={String(formData.expires_in_days || 7)}
                  onValueChange={v => setFormData(prev => ({ ...prev, expires_in_days: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Download and Print Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Allow Download</Label>
                <Switch
                  checked={formData.allow_download}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, allow_download: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Allow Print</Label>
                <Switch
                  checked={formData.allow_print}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, allow_print: v }))}
                />
              </div>
            </div>

            {/* Custom Message */}
            <div className="space-y-2">
              <Label>Message (Optional)</Label>
              <Textarea
                value={formData.message || ''}
                onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Add a personal message for the guest..."
                className="h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!formData.guest_email || !formData.resource_id}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Send Invitation
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
  return (
    <ScrollArea className="w-full">
      <div className="space-y-2">
        {shares.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No shares in this category
          </div>
        ) : (
          shares.map(share => (
            <Card key={share.id} className="border-gray-700">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-white truncate">{share.guest_email}</span>
                      {share.guest_name && (
                        <span className="text-sm text-muted-foreground">
                          ({share.guest_name})
                        </span>
                      )}
                      <Badge className={getStatusColor(share.status)}>
                        {share.status}
                      </Badge>
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

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCopyLink(share)}
                      title="Copy share link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {share.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onResend(share.id)}
                        title="Resend invitation"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {share.status !== 'revoked' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRevoke(share.id)}
                        title="Revoke access"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(share.id)}
                      title="Delete share record"
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
    </ScrollArea>
  );
}
