import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Link,
  Copy,
  Check,
  Plus,
  MoreHorizontal,
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
  QrCode,
  Settings,
  Search,
  Filter,
  TrendingUp
} from 'lucide-react';
import { useShareLinks } from '@/hooks/useShareLinks';
import { useToast } from '@/hooks/use-toast';
import type { EnhancedShareLink, ShareLinkPermission } from '@/types/shareLink';
import {
  SHARE_LINK_PERMISSION_INFO,
  generateShareUrl,
  generateQRCodeUrl
} from '@/types/shareLink';
import { formatDistanceToNow, format } from 'date-fns';
import { QuickShareDialog } from './QuickShareDialog';
import { ShareLinkAnalyticsPanel } from './ShareLinkAnalyticsPanel';

interface ShareLinksDashboardProps {
  resourceId?: string;
  resourceType?: 'document' | 'folder' | 'workspace' | 'form';
  resourceName?: string;
}

export const ShareLinksDashboard: React.FC<ShareLinksDashboardProps> = ({
  resourceId,
  resourceType = 'document',
  resourceName = 'Document'
}) => {
  const {
    links,
    loading,
    totalViews,
    activeLinks,
    expiredLinks,
    revokedLinks,
    createLink,
    updateLink,
    revokeLink,
    reactivateLink,
    deleteLink,
    duplicateLink,
    incrementViewCount,
    refreshLinks
  } = useShareLinks(resourceId);
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState<EnhancedShareLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredLinks = (activeTab === 'active' ? activeLinks : activeTab === 'expired' ? expiredLinks : revokedLinks)
    .filter(l =>
      l.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.resource_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const totalActiveLinks = activeLinks.length;

  const copyLink = async (link: EnhancedShareLink) => {
    const url = generateShareUrl(link.token);
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
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

  const getStatusBadge = (link: EnhancedShareLink) => {
    if (!link.is_active) {
      return <Badge variant="destructive">Revoked</Badge>;
    }
    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
      return <Badge variant="secondary">Expired</Badge>;
    }
    if (link.max_uses && link.use_count >= link.max_uses) {
      return <Badge variant="secondary">Limit Reached</Badge>;
    }
    return <Badge variant="default" className="bg-green-500">Active</Badge>;
  };

  if (selectedLink) {
    return (
      <ShareLinkAnalyticsPanel
        link={selectedLink}
        onBack={() => setSelectedLink(null)}
        onUpdate={updateLink}
        onRevoke={revokeLink}
        onDelete={deleteLink}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Links</p>
                <p className="text-2xl font-bold">{totalActiveLinks}</p>
              </div>
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Link className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Views</p>
                <p className="text-2xl font-bold">{totalViews}</p>
              </div>
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Eye className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Password Protected</p>
                <p className="text-2xl font-bold">
                  {links.filter(l => l.password_protected).length}
                </p>
              </div>
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Lock className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold">
                  {activeLinks.filter(l => l.expires_at && new Date(l.expires_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).length}
                </p>
              </div>
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link className="w-5 h-5" />
              Share Links
            </CardTitle>
            <CardDescription>
              Manage and track all your share links
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Link
          </Button>
        </CardHeader>

        <CardContent>
          {/* Search and Filter */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search links..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="active" className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                Active
                <Badge variant="secondary" className="ml-1">{activeLinks.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="expired" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Expired
                <Badge variant="secondary" className="ml-1">{expiredLinks.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="revoked" className="flex items-center gap-2">
                <Pause className="w-4 h-4" />
                Revoked
                <Badge variant="secondary" className="ml-1">{revokedLinks.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              <ScrollArea className="h-[400px]">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredLinks.length === 0 ? (
                  <div className="text-center py-8">
                    <Link className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No links found</p>
                    {activeTab === 'active' && (
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setShowCreateDialog(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create your first link
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        {/* Icon & Permission */}
                        <div className="p-2 bg-muted rounded-lg">
                          {getPermissionIcon(link.permission)}
                        </div>

                        {/* Link Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium truncate">
                              {link.name || link.resource_name || 'Untitled Link'}
                            </p>
                            {getStatusBadge(link)}
                            {link.password_protected && (
                              <Lock className="w-3 h-3 text-muted-foreground" />
                            )}
                            {link.require_email && (
                              <Mail className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {link.use_count} views
                              {link.max_uses && ` / ${link.max_uses}`}
                            </span>
                            <span>
                              Created {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
                            </span>
                            {link.expires_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(link.expires_at) > new Date()
                                  ? `Expires ${format(new Date(link.expires_at), 'MMM d')}`
                                  : 'Expired'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Usage Progress */}
                        {link.max_uses && (
                          <div className="w-24">
                            <Progress
                              value={(link.use_count / link.max_uses) * 100}
                              className="h-2"
                            />
                            <p className="text-xs text-muted-foreground text-center mt-1">
                              {Math.round((link.use_count / link.max_uses) * 100)}% used
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyLink(link)}
                          >
                            {copiedId === link.id ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedLink(link)}
                          >
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(generateShareUrl(link.token), '_blank')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => copyLink(link)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSelectedLink(link)}>
                                <BarChart3 className="w-4 h-4 mr-2" />
                                View Analytics
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateLink(link.id)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  incrementViewCount(link.id);
                                  toast({
                                    title: 'View recorded',
                                    description: `View count for "${link.name || link.resource_name}" increased by 1`
                                  });
                                }}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Simulate View
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {link.is_active ? (
                                <DropdownMenuItem onClick={() => revokeLink(link.id)}>
                                  <Pause className="w-4 h-4 mr-2" />
                                  Revoke Link
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => reactivateLink(link.id)}>
                                  <Play className="w-4 h-4 mr-2" />
                                  Reactivate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteLink(link.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <QuickShareDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateLink={createLink}
      />
    </div>
  );
};
