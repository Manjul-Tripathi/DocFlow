import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Key,
  Plus,
  Cloud,
  HardDrive,
  Database,
  Check,
  X,
  Trash2,
  RefreshCw,
  Shield,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { useMigration } from '@/hooks/useMigration';
import { formatDistanceToNow } from 'date-fns';
import type { MigrationCredentials, SourceSystem } from '@/types/migration';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { oauthService } from '@/services/oauthService';

interface CredentialsPanelProps {
  credentials: MigrationCredentials[];
}

export function CredentialsPanel({ credentials }: CredentialsPanelProps) {
  const { saveCredentials } = useMigration();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isOAuthComplete, setIsOAuthComplete] = useState(false);
  const [oauthToken, setOAuthToken] = useState<string | null>(null);
  const [newCredential, setNewCredential] = useState<{
    name: string;
    source_system: SourceSystem;
    credentials: Record<string, string>;
  }>({
    name: '',
    source_system: 'google_drive',
    credentials: {}
  });

  const getSourceIcon = (source: SourceSystem) => {
    switch (source) {
      case 'google_drive': return <Cloud className="h-5 w-5 text-blue-500" />;
      case 'onedrive': return <HardDrive className="h-5 w-5 text-sky-500" />;
      case 'filenet': return <Database className="h-5 w-5 text-purple-500" />;
    }
  };

  // Handle Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);

    try {
      const result = await oauthService.authenticate('google_drive');

      if (result.success && result.accessToken) {
        setIsOAuthComplete(true);
        setOAuthToken(result.accessToken);

        // Auto-generate a name if not set
        if (!newCredential.name) {
          const timestamp = new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setNewCredential(prev => ({
            ...prev,
            name: `Google Drive (${timestamp})`
          }));
        }

        toast({
          title: 'Successfully connected to Google Drive!',
          description: 'Click "Save Connection" to complete setup.'
        });
      }
    } catch (error) {
      console.error('OAuth failed:', error);
      toast({
        title: 'Authentication failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive'
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle Microsoft OAuth Sign In
  const handleMicrosoftSignIn = async () => {
    setIsAuthenticating(true);

    try {
      const result = await oauthService.authenticate('onedrive');

      if (result.success && result.accessToken) {
        setIsOAuthComplete(true);
        setOAuthToken(result.accessToken);

        if (!newCredential.name) {
          const timestamp = new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setNewCredential(prev => ({
            ...prev,
            name: `OneDrive (${timestamp})`
          }));
        }

        toast({
          title: 'Successfully connected to OneDrive!',
          description: 'Click "Save Connection" to complete setup.'
        });
      }
    } catch (error) {
      console.error('OAuth failed:', error);
      toast({
        title: 'Authentication failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive'
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSaveCredential = () => {
    // For OAuth-based sources, use the token
    if ((newCredential.source_system === 'google_drive' || newCredential.source_system === 'onedrive') && oauthToken) {
      const creds = newCredential.source_system === 'google_drive'
        ? {
          access_token: oauthToken,
          token_uri: 'https://oauth2.googleapis.com/token',
          scopes: ['https://www.googleapis.com/auth/drive.readonly']
        }
        : {
          access_token: oauthToken,
          // OneDrive doesn't need token_uri for simple access_token auth
        };

      saveCredentials({
        name: newCredential.name,
        source_system: newCredential.source_system,
        credentials: creds
      });
    } else {
      // For FileNet, use manual credentials
      saveCredentials({
        name: newCredential.name,
        source_system: newCredential.source_system,
        credentials: newCredential.credentials
      });
    }

    // Reset and close dialog
    setShowAddDialog(false);
    setIsOAuthComplete(false);
    setOAuthToken(null);
    setNewCredential({
      name: '',
      source_system: 'google_drive',
      credentials: {}
    });
  };

  const resetDialog = () => {
    setShowAddDialog(false);
    setIsOAuthComplete(false);
    setOAuthToken(null);
    setNewCredential({
      name: '',
      source_system: 'google_drive',
      credentials: {}
    });
    setIsAuthenticating(false);
  };

  // Get FileNet credential fields (manual entry)
  const getFileNetFields = () => [
    { key: 'server_url', label: 'Server URL', type: 'text' },
    { key: 'username', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'object_store', label: 'Object Store', type: 'text' }
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Connected Accounts
              </CardTitle>
              <CardDescription>
                Connect your cloud storage accounts for migration
              </CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={(open) => {
              if (!open) resetDialog();
              else setShowAddDialog(true);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Connect Cloud Account</DialogTitle>
                  <DialogDescription>
                    Sign in to connect your cloud storage account
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Source System Selection */}
                  <div className="space-y-2">
                    <Label>Source Type</Label>
                    <Select
                      value={newCredential.source_system}
                      onValueChange={(v: SourceSystem) => {
                        setNewCredential({
                          ...newCredential,
                          source_system: v,
                          credentials: {},
                          name: ''
                        });
                        setIsOAuthComplete(false);
                        setOAuthToken(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google_drive">Google Drive</SelectItem>
                        <SelectItem value="onedrive">OneDrive / SharePoint</SelectItem>
                        <SelectItem value="filenet">IBM FileNet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Google Drive OAuth Flow */}
                  {newCredential.source_system === 'google_drive' && (
                    <div className="space-y-4">
                      {!isOAuthComplete ? (
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg">
                          <Cloud className="h-12 w-12 text-blue-500 mb-4" />
                          <p className="text-sm text-muted-foreground mb-4 text-center">
                            Sign in with your Google account to grant access to your Drive files
                          </p>
                          <Button
                            onClick={handleGoogleSignIn}
                            disabled={isAuthenticating}
                            size="lg"
                            className="gap-2"
                          >
                            {isAuthenticating ? (
                              <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <svg className="h-5 w-5" viewBox="0 0 24 24">
                                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Sign in with Google
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                                Connected to Google Drive
                              </p>
                              <p className="text-xs text-green-700 dark:text-green-300">
                                Ready to save this connection
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="name">Connection Name</Label>
                            <Input
                              id="name"
                              placeholder="e.g., My Google Drive"
                              value={newCredential.name}
                              onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OneDrive OAuth Flow */}
                  {newCredential.source_system === 'onedrive' && (
                    <div className="space-y-4">
                      {!isOAuthComplete ? (
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg">
                          <HardDrive className="h-12 w-12 text-blue-500 mb-4" />
                          <p className="text-sm text-muted-foreground mb-4 text-center">
                            Sign in with your Microsoft account to grant access to your OneDrive files
                          </p>
                          <Button
                            onClick={handleMicrosoftSignIn}
                            disabled={isAuthenticating}
                            size="lg"
                            className="gap-2"
                          >
                            {isAuthenticating ? (
                              <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <svg className="h-5 w-5" viewBox="0 0 24 24">
                                  <path fill="currentColor" d="M24 12.3l-7.2 4.8V7.5L24 12.3zm-7.2-2.4v8.4L8.4 23V13.8L0 9l5.4-3.6L8.4 7.2l8.4 2.7zm-9 8.1l6.6-4.5L8.4 9v9zM5.4 9L0 12.3l8.4 5.4v-9l-3-1.8z" />
                                </svg>
                                Sign in with Microsoft
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                            <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                Connected to OneDrive
                              </p>
                              <p className="text-xs text-blue-700 dark:text-blue-300">
                                Ready to save this connection
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="name">Connection Name</Label>
                            <Input
                              id="name"
                              placeholder="e.g., My OneDrive"
                              value={newCredential.name}
                              onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* FileNet Manual Entry */}
                  {newCredential.source_system === 'filenet' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Connection Name</Label>
                        <Input
                          placeholder="e.g., Production FileNet"
                          value={newCredential.name}
                          onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })}
                        />
                      </div>

                      {getFileNetFields().map((field) => (
                        <div key={field.key} className="space-y-2">
                          <Label>{field.label}</Label>
                          <Input
                            type={field.type}
                            value={(newCredential.credentials as any)[field.key] || ''}
                            onChange={(e) => setNewCredential({
                              ...newCredential,
                              credentials: {
                                ...newCredential.credentials,
                                [field.key]: e.target.value
                              }
                            })}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-muted/50 flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Your account access is secure. We only request read permissions to migrate your files.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={resetDialog}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveCredential}
                    disabled={
                      !newCredential.name ||
                      ((newCredential.source_system === 'google_drive' || newCredential.source_system === 'onedrive') && !isOAuthComplete) ||
                      (newCredential.source_system === 'filenet' && !newCredential.credentials.server_url)
                    }
                  >
                    Save Connection
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Cloud className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No accounts connected</p>
              <p className="text-sm mt-1">
                Connect your Google Drive or OneDrive to start migrating files
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Connect Account
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {credentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center gap-4 p-4 rounded-lg border"
                  >
                    {getSourceIcon(cred.source_system)}
                    <div className="flex-1">
                      <p className="font-medium">{cred.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {cred.source_system.replace('_', ' ')}
                      </p>
                      {cred.last_validated_at && (
                        <p className="text-xs text-muted-foreground">
                          Connected {formatDistanceToNow(new Date(cred.last_validated_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    {cred.is_valid ? (
                      <Badge className="bg-green-500">
                        <Check className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <X className="h-3 w-3 mr-1" />
                        Expired
                      </Badge>
                    )}
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" title="Refresh connection">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={async () => {
                          if (confirm('Remove this connection?')) {
                            try {
                              const { data: userData } = await supabase.auth.getUser();
                              if (!userData.user) return;

                              await supabase
                                .from('migration_credentials')
                                .delete()
                                .eq('id', cred.id)
                                .eq('user_id', userData.user.id);

                              window.location.reload();
                            } catch (error) {
                              console.error('Delete failed:', error);
                            }
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Quick Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium flex items-center gap-2 mb-2">
              <Cloud className="h-4 w-4 text-blue-500" />
              Google Drive
            </h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click "Add Account" above</li>
              <li>Select "Google Drive"</li>
              <li>Click "Sign in with Google"</li>
              <li>Grant permission to access your files</li>
              <li>Save the connection</li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium flex items-center gap-2 mb-2">
              <HardDrive className="h-4 w-4 text-sky-500" />
              OneDrive / SharePoint
            </h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click "Add Account" above</li>
              <li>Select "OneDrive / SharePoint"</li>
              <li>Click "Sign in with Microsoft"</li>
              <li>Grant permission to access your files</li>
              <li>Save the connection</li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-purple-500" />
              IBM FileNet
            </h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click "Add Account" above</li>
              <li>Select "IBM FileNet"</li>
              <li>Enter your server URL and credentials</li>
              <li>Save the connection</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
