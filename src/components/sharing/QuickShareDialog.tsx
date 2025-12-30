import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Link,
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
  Globe,
  Shield,
  QrCode,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  X,
  Plus,
  FileText,
  Search,
  Loader2,
  ArrowLeft,
  Folder
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type {
  CreateShareLinkParams,
  ShareLinkPermission,
  EnhancedShareLink
} from '@/types/shareLink';
import {
  SHARE_LINK_PERMISSION_INFO,
  EXPIRATION_OPTIONS,
  generateShareUrl,
  generateQRCodeUrl
} from '@/types/shareLink';
import { useDocuments } from '../simplify-drive/hooks/useDocuments';

interface SelectedDocument {
  id: string;
  name: string;
  type: string;
  size?: number;
}

interface QuickShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType?: 'document' | 'folder' | 'workspace' | 'form';
  resourceId?: string;
  resourceName?: string;
  onCreateLink: (params: CreateShareLinkParams) => Promise<EnhancedShareLink | null>;
}

export const QuickShareDialog: React.FC<QuickShareDialogProps> = ({
  open,
  onOpenChange,
  resourceType: initialResourceType,
  resourceId: initialResourceId,
  resourceName: initialResourceName,
  onCreateLink
}) => {
  const { toast } = useToast();
  const { documents, loading: documentsLoading } = useDocuments();

  // Document selection state
  const [step, setStep] = useState<'select' | 'configure' | 'success'>('select');
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Share configuration state
  const [activeTab, setActiveTab] = useState('quick');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<EnhancedShareLink | null>(null);
  const [copied, setCopied] = useState(false);

  // Quick share state
  const [permission, setPermission] = useState<ShareLinkPermission>('view');
  const [expiration, setExpiration] = useState<number>(168); // 7 days default

  // Advanced settings
  const [linkName, setLinkName] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [requireEmail, setRequireEmail] = useState(false);
  const [requireName, setRequireName] = useState(false);
  const [hasMaxUses, setHasMaxUses] = useState(false);
  const [maxUses, setMaxUses] = useState(100);
  const [allowDownload, setAllowDownload] = useState(false);
  const [allowPrint, setAllowPrint] = useState(false);
  const [allowCopy, setAllowCopy] = useState(true);
  const [notifyOnAccess, setNotifyOnAccess] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [blockedEmails, setBlockedEmails] = useState<string[]>([]);
  const [newBlockedEmail, setNewBlockedEmail] = useState('');

  // Custom Base URL for QR Code (fixes localhost issue)
  const [customBaseUrl, setCustomBaseUrl] = useState('');

  useEffect(() => {
    setCustomBaseUrl(window.location.origin);
  }, []);

  // If document is pre-selected, skip to configure step
  useEffect(() => {
    if (initialResourceId && initialResourceName) {
      setSelectedDocument({
        id: initialResourceId,
        name: initialResourceName,
        type: initialResourceType || 'document'
      });
      setStep('configure');
    } else {
      setStep('select');
    }
  }, [initialResourceId, initialResourceName, initialResourceType, open]);

  // Filter documents based on search
  const filteredDocuments = documents.filter(doc =>
    doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDocumentSelect = (doc: typeof documents[0]) => {
    setSelectedDocument({
      id: doc.id,
      name: doc.file_name,
      type: doc.file_type,
      size: doc.file_size
    });
    setStep('configure');
  };

  const handleCreate = async () => {
    if (!selectedDocument) return;

    // Validate password if enabled
    if (hasPassword && (password.length < 4 || password.length > 8)) {
      toast({
        title: 'Invalid Password',
        description: 'Password must be 4-8 characters',
        variant: 'destructive'
      });
      return;
    }

    setCreating(true);
    try {
      const params: CreateShareLinkParams = {
        resource_type: 'document',
        resource_id: selectedDocument.id,
        resource_name: selectedDocument.name,
        permission,
        name: linkName || undefined,
        allow_download: allowDownload || permission === 'download',
        allow_print: allowPrint,
        allow_copy: allowCopy,
        password: hasPassword ? password : undefined,
        require_email: requireEmail,
        require_name: requireName,
        blocked_emails: blockedEmails.length > 0 ? blockedEmails : undefined,
        allowed_domains: allowedDomains.length > 0 ? allowedDomains : undefined,
        max_uses: hasMaxUses ? maxUses : undefined,
        expires_in_hours: expiration > 0 ? expiration : undefined,
        notify_on_access: notifyOnAccess,
        watermark_enabled: watermarkEnabled,
        watermark_text: watermarkEnabled ? watermarkText : undefined
      };

      const link = await onCreateLink(params);
      if (link) {
        setCreatedLink(link);
        setStep('success');
      }
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!createdLink) return;
    const url = generateShareUrl(createdLink.token, customBaseUrl);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Link copied!',
      description: 'Share link copied to clipboard'
    });
  };

  const downloadQR = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `qrcode-${selectedDocument?.name || 'share'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      toast({
        title: "QR Code Downloaded",
        description: "Image saved to your device",
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Could not save QR code image",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setCreatedLink(null);
    setSelectedDocument(null);
    setStep('select');
    setPermission('view');
    setExpiration(168);
    setLinkName('');
    setHasPassword(false);
    setPassword('');
    setRequireEmail(false);
    setRequireName(false);
    setHasMaxUses(false);
    setMaxUses(100);
    setAllowDownload(false);
    setAllowPrint(false);
    setAllowCopy(true);
    setNotifyOnAccess(false);
    setWatermarkEnabled(false);
    setWatermarkText('');
    setAllowedDomains([]);
    setBlockedEmails([]);
    setActiveTab('quick');
    setSearchQuery('');
    setCustomBaseUrl(window.location.origin);
  };

  const addDomain = () => {
    if (newDomain && !allowedDomains.includes(newDomain)) {
      setAllowedDomains([...allowedDomains, newDomain]);
      setNewDomain('');
    }
  };

  const addBlockedEmail = () => {
    if (newBlockedEmail && !blockedEmails.includes(newBlockedEmail)) {
      setBlockedEmails([...blockedEmails, newBlockedEmail]);
      setNewBlockedEmail('');
    }
  };

  const getPermissionIcon = (perm: ShareLinkPermission) => {
    switch (perm) {
      case 'view': return <Eye className="w-4 h-4" />;
      case 'download': return <Download className="w-4 h-4" />;
      case 'edit': return <Edit className="w-4 h-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    if (type.includes('image')) return <FileText className="w-5 h-5 text-blue-500" />;
    if (type.includes('document') || type.includes('word')) return <FileText className="w-5 h-5 text-blue-600" />;
    if (type.includes('sheet') || type.includes('excel')) return <FileText className="w-5 h-5 text-green-600" />;
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  // Step 1: Document Selection
  if (step === 'select') {
    return (
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Select Document to Share
            </DialogTitle>
            <DialogDescription>
              Choose a document from your library to create a share link
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative py-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Document List */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {documentsLoading ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No documents match your search' : 'No documents found'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload some documents first to share them
                </p>
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {filteredDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleDocumentSelect(doc)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 hover:border-primary/50 transition-all text-left group"
                  >
                    <div className="p-2 bg-muted rounded-lg group-hover:bg-primary/10">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>•</span>
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.file_type.split('/').pop() || 'document'}
                        </Badge>
                      </div>
                    </div>
                    <Link className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end pt-4 border-t mt-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 3: Success state - show created link
  if (step === 'success' && createdLink) {
    const shareUrl = generateShareUrl(createdLink.token, customBaseUrl);
    const qrUrl = generateQRCodeUrl(shareUrl, 150);
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    return (
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 bg-green-500/10 rounded-full">
                <Check className="w-5 h-5 text-green-500" />
              </div>
              Link Created!
            </DialogTitle>
            <DialogDescription>
              Your share link for "{selectedDocument?.name}" is ready.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Link URL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Share Link</Label>
                {isLocalhost && (
                  <Badge variant="outline" className="text-[10px] h-5 border-yellow-500 text-yellow-500 animate-pulse">
                    Localhost Detected
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button onClick={copyLink} className="shrink-0">
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {isLocalhost && (
                <div className="rounded-md bg-yellow-500/10 p-3 border border-yellow-500/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                    <div className="space-y-2 w-full">
                      <p className="text-xs text-yellow-500 font-medium">
                        QR Code won't work on mobile with "localhost".
                      </p>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Replace localhost with your PC's IP (e.g. 192.168.1.X)</Label>
                        <Input
                          value={customBaseUrl}
                          onChange={(e) => setCustomBaseUrl(e.target.value)}
                          className="h-7 text-xs font-mono bg-background"
                          placeholder="http://192.168.1.X:5173"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* QR Code & Info */}
            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <img
                  src={qrUrl}
                  alt="QR Code"
                  className="w-[120px] h-[120px] rounded-lg border mb-2"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => downloadQR(qrUrl)}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Save
                </Button>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  {getPermissionIcon(createdLink.permission)}
                  <span className="font-medium">
                    {SHARE_LINK_PERMISSION_INFO[createdLink.permission].label}
                  </span>
                </div>
                {createdLink.expires_at && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Expires {new Date(createdLink.expires_at).toLocaleDateString()}
                  </div>
                )}
                {createdLink.password_protected && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="w-4 h-4" />
                    Password protected
                  </div>
                )}
                {createdLink.max_uses && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    Limited to {createdLink.max_uses} uses
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.open(shareUrl, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Preview Link
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetForm}
              >
                <Plus className="w-4 h-4 mr-2" />
                Share Another
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2: Configure share settings
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-[550px] h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {!initialResourceId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setSelectedDocument(null); setStep('select'); }}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5" />
              Share "{selectedDocument?.name}"
            </DialogTitle>
          </div>
          <DialogDescription>
            Create a shareable link with customizable permissions and security
          </DialogDescription>
        </DialogHeader>

        {/* Selected document info */}
        {selectedDocument && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border shrink-0">
            {getFileIcon(selectedDocument.type)}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{selectedDocument.name}</p>
              <p className="text-xs text-muted-foreground">
                {selectedDocument.size ? formatFileSize(selectedDocument.size) : 'Document'}
              </p>
            </div>
            {!initialResourceId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedDocument(null); setStep('select'); }}
              >
                Change
              </Button>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="quick" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Quick Share
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Advanced
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <TabsContent value="quick" className="space-y-6 mt-4 pb-4">
              {/* Permission Selection */}
              <div className="space-y-3">
                <Label>Who can access this link?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SHARE_LINK_PERMISSION_INFO) as ShareLinkPermission[]).map((perm) => (
                    <button
                      key={perm}
                      onClick={() => setPermission(perm)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${permission === perm
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                        }`}
                    >
                      <div className={`p-2 rounded-lg ${permission === perm ? 'bg-primary/10' : 'bg-muted'
                        }`}>
                        {getPermissionIcon(perm)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {SHARE_LINK_PERMISSION_INFO[perm].label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {SHARE_LINK_PERMISSION_INFO[perm].description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiration */}
              <div className="space-y-3">
                <Label>Link expiration</Label>
                <Select
                  value={expiration.toString()}
                  onValueChange={(v) => setExpiration(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.hours} value={opt.hours.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quick toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Password Protection
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Require a password to access
                    </p>
                  </div>
                  <Switch checked={hasPassword} onCheckedChange={setHasPassword} />
                </div>
                {hasPassword && (
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6 mt-4 pb-4">
              {/* Link Name */}
              <div className="space-y-2">
                <Label>Link Name (optional)</Label>
                <Input
                  placeholder="e.g., External Partners, Client Review"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Help identify this link in your dashboard
                </p>
              </div>

              <Separator />

              {/* Security Options */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Security
                </h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Password Protection</Label>
                    <p className="text-xs text-muted-foreground">Require password to access</p>
                  </div>
                  <Switch checked={hasPassword} onCheckedChange={setHasPassword} />
                </div>
                {hasPassword && (
                  <div className="space-y-1">
                    <Input
                      type="password"
                      placeholder="Enter password (4-8 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value.slice(0, 8))}
                      maxLength={8}
                    />
                    <p className={`text-xs ${password.length >= 4 && password.length <= 8 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {password.length}/8 characters {password.length < 4 && '(min 4 required)'}
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Access Restrictions */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Access Restrictions
                </h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Limit Uses</Label>
                    <p className="text-xs text-muted-foreground">Maximum access count</p>
                  </div>
                  <Switch checked={hasMaxUses} onCheckedChange={setHasMaxUses} />
                </div>
                {hasMaxUses && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={maxUses}
                      onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                      min={1}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">uses</span>
                  </div>
                )}

                {/* Domain Whitelist */}
                <div className="space-y-2">
                  <Label>Allowed Email Domains</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., company.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                    />
                    <Button variant="outline" onClick={addDomain}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {allowedDomains.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {allowedDomains.map((domain) => (
                        <Badge key={domain} variant="secondary" className="gap-1">
                          @{domain}
                          <button onClick={() => setAllowedDomains(allowedDomains.filter(d => d !== domain))}>
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Email Blocklist */}
                <div className="space-y-2">
                  <Label>Blocked Emails</Label>
                  <p className="text-xs text-muted-foreground">Block specific emails from accessing this link</p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="e.g., blocked@example.com"
                      value={newBlockedEmail}
                      onChange={(e) => setNewBlockedEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addBlockedEmail()}
                    />
                    <Button variant="outline" onClick={addBlockedEmail}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {blockedEmails.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {blockedEmails.map((email) => (
                        <Badge key={email} variant="destructive" className="gap-1">
                          {email}
                          <button onClick={() => setBlockedEmails(blockedEmails.filter(e => e !== email))}>
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Content Controls */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Content Controls
                </h4>

                <div className="flex items-center justify-between">
                  <Label>Allow Download</Label>
                  <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Allow Print</Label>
                  <Switch checked={allowPrint} onCheckedChange={setAllowPrint} />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Allow Copy Text</Label>
                  <Switch checked={allowCopy} onCheckedChange={setAllowCopy} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Watermark</Label>
                    <p className="text-xs text-muted-foreground">Add visible watermark</p>
                  </div>
                  <Switch checked={watermarkEnabled} onCheckedChange={setWatermarkEnabled} />
                </div>
                {watermarkEnabled && (
                  <Input
                    placeholder="e.g., CONFIDENTIAL"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                  />
                )}
              </div>

              <Separator />

              {/* Notifications */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Notifications
                </h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notify on Access</Label>
                    <p className="text-xs text-muted-foreground">Get notified when link is used</p>
                  </div>
                  <Switch checked={notifyOnAccess} onCheckedChange={setNotifyOnAccess} />
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !selectedDocument || (hasPassword && !password)}
          >
            {creating ? 'Creating...' : 'Create Link'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
