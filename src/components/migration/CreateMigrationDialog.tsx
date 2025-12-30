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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Cloud, HardDrive, Database, Loader2, FolderOpen, Shield, Zap, CheckCircle2 } from 'lucide-react';
import { CloudFolderBrowser } from '@/components/bulk-processing/CloudFolderBrowser';
import { oauthService } from '@/services/oauthService';
import { useToast } from '@/hooks/use-toast';
import type { SourceSystem, MigrationConfig, MigrationCredentials } from '@/types/migration';

interface CreateMigrationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (params: {
        name: string;
        source_system: SourceSystem;
        config: MigrationConfig;
        credentials_id?: string;
    }) => void;
    credentials: MigrationCredentials[];
    isLoading: boolean;
}

export function CreateMigrationDialog({
    open,
    onOpenChange,
    onSubmit,
    credentials,
    isLoading
}: CreateMigrationDialogProps) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [sourceSystem, setSourceSystem] = useState<SourceSystem>('google_drive');
    const [credentialsId, setCredentialsId] = useState<string>('');
    const [accessToken, setAccessToken] = useState<string>('');
    const [selectedFolderName, setSelectedFolderName] = useState<string>('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [config, setConfig] = useState<MigrationConfig>({
        include_subfolders: true,
        include_permissions: true,
        include_versions: false,
        duplicate_policy: 'keep_both',
        concurrency: 10,
        retry_attempts: 3,
        delta_mode: false,
        dry_run: false
    });

    const sourceCredentials = credentials.filter(c => c.source_system === sourceSystem);

    // Load access token from localStorage when credential is selected
    useEffect(() => {
        const savedToken = localStorage.getItem(`${sourceSystem}_access_token`);
        if (savedToken) {
            setAccessToken(savedToken);
        }
    }, [sourceSystem, credentialsId]);

    const handleQuickConnect = async () => {
        setIsAuthenticating(true);
        try {
            const result = await oauthService.authenticate(sourceSystem);
            if (result.success && result.accessToken) {
                setAccessToken(result.accessToken);
                localStorage.setItem(`${sourceSystem}_access_token`, result.accessToken);
                toast({ title: `Connected to ${sourceSystem === 'google_drive' ? 'Google Drive' : 'OneDrive'}!` });
            }
        } catch (error) {
            toast({
                title: 'Connection failed',
                description: error instanceof Error ? error.message : 'Please try again',
                variant: 'destructive'
            });
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleSubmit = () => {
        // Include access token in config for Quick Connect (no saved credentials)
        const finalConfig = { ...config };
        if (accessToken && !credentialsId) {
            finalConfig.access_token = accessToken;
        }

        onSubmit({
            name,
            source_system: sourceSystem,
            config: finalConfig,
            credentials_id: credentialsId || undefined
        });
        // Reset state
        setStep(1);
        setName('');
        setSelectedFolderName('');
    };

    const handleFolderSelect = (folderId: string, folderName: string) => {
        setConfig({ ...config, source_folder_id: folderId || undefined });
        setSelectedFolderName(folderName);
    };

    const sources = [
        {
            id: 'google_drive' as SourceSystem,
            name: 'Google Drive',
            icon: Cloud,
            color: 'text-blue-500',
            description: 'Migrate from Google Drive including shared drives'
        },
        {
            id: 'onedrive' as SourceSystem,
            name: 'OneDrive / SharePoint',
            icon: HardDrive,
            color: 'text-sky-500',
            description: 'Migrate from Microsoft OneDrive and SharePoint'
        },
        {
            id: 'filenet' as SourceSystem,
            name: 'IBM FileNet',
            icon: Database,
            color: 'text-purple-500',
            description: 'Migrate from IBM FileNet P8'
        }
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Migration Job</DialogTitle>
                    <DialogDescription>
                        Configure a new migration from an external source to SimplifyDrive
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={String(step)} onValueChange={(v) => setStep(Number(v))}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="1">1. Source</TabsTrigger>
                        <TabsTrigger value="2" disabled={!sourceSystem}>2. Select Files</TabsTrigger>
                        <TabsTrigger value="3" disabled={!name}>3. Options</TabsTrigger>
                    </TabsList>

                    {/* Step 1: Source Selection */}
                    <TabsContent value="1" className="space-y-4">
                        <div className="grid gap-4">
                            {sources.map((source) => (
                                <Card
                                    key={source.id}
                                    className={`cursor-pointer transition-all ${sourceSystem === source.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
                                        }`}
                                    onClick={() => setSourceSystem(source.id)}
                                >
                                    <CardContent className="flex items-center gap-4 p-4">
                                        <source.icon className={`h-10 w-10 ${source.color}`} />
                                        <div className="flex-1">
                                            <h3 className="font-semibold">{source.name}</h3>
                                            <p className="text-sm text-muted-foreground">{source.description}</p>
                                        </div>
                                        {sourceSystem === source.id && (
                                            <div className="h-4 w-4 rounded-full bg-primary" />
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>

                    {/* Step 2: Select Files/Folders */}
                    <TabsContent value="2" className="space-y-4">
                        <div className="space-y-4">
                            {/* Migration Name */}
                            <div className="space-y-2">
                                <Label htmlFor="name">Migration Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g., Q4 2024 Google Drive Migration"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            {/* Connect or Select Account */}
                            <div className="space-y-2">
                                <Label>Connected Account</Label>
                                {sourceCredentials.length > 0 ? (
                                    <Select value={credentialsId} onValueChange={setCredentialsId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select saved account" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sourceCredentials.map(cred => (
                                                <SelectItem key={cred.id} value={cred.id}>
                                                    {cred.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No saved accounts. Connect below:
                                    </p>
                                )}
                            </div>

                            {/* Quick Connect Button */}
                            {!accessToken && (sourceSystem === 'google_drive' || sourceSystem === 'onedrive') && (
                                <div className="flex justify-center p-4 border-2 border-dashed rounded-lg">
                                    <Button
                                        onClick={handleQuickConnect}
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
                                                {sourceSystem === 'google_drive' ? (
                                                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                                                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                                                        <path fill="currentColor" d="M24 12.3l-7.2 4.8V7.5L24 12.3zm-7.2-2.4v8.4L8.4 23V13.8L0 9l5.4-3.6L8.4 7.2l8.4 2.7zm-9 8.1l6.6-4.5L8.4 9v9zM5.4 9L0 12.3l8.4 5.4v-9l-3-1.8z" />
                                                    </svg>
                                                )}
                                                Connect {sourceSystem === 'google_drive' ? 'Google Drive' : 'OneDrive'}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            {/* Connected Status */}
                            {accessToken && (
                                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    <span className="text-sm font-medium text-green-900 dark:text-green-100">
                                        Connected to {sourceSystem === 'google_drive' ? 'Google Drive' : 'OneDrive'}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-auto"
                                        onClick={() => {
                                            setAccessToken('');
                                            localStorage.removeItem(`${sourceSystem}_access_token`);
                                        }}
                                    >
                                        Disconnect
                                    </Button>
                                </div>
                            )}

                            {/* Folder Browser */}
                            {accessToken && (sourceSystem === 'google_drive' || sourceSystem === 'onedrive') && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <FolderOpen className="h-4 w-4" />
                                        Select Folder or Files to Migrate
                                    </Label>
                                    <CloudFolderBrowser
                                        sourceSystem={sourceSystem}
                                        accessToken={accessToken}
                                        onSelectFolder={handleFolderSelect}
                                        selectedFolderId={config.source_folder_id}
                                        showFiles={true}
                                        allowFileSelection={false}
                                    />
                                    {selectedFolderName && (
                                        <p className="text-sm text-muted-foreground">
                                            Selected: <span className="font-medium">{selectedFolderName}</span>
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* FileNet - Manual Input */}
                            {sourceSystem === 'filenet' && (
                                <div className="space-y-2">
                                    <Label htmlFor="source_folder">Source Folder Path</Label>
                                    <Input
                                        id="source_folder"
                                        placeholder="Leave empty for root/entire drive"
                                        value={config.source_folder_id || ''}
                                        onChange={(e) => setConfig({ ...config, source_folder_id: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* Step 3: Options */}
                    <TabsContent value="3" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Content Options */}
                            <Card>
                                <CardContent className="pt-4 space-y-4">
                                    <h4 className="font-medium flex items-center gap-2">
                                        <FolderOpen className="h-4 w-4" />
                                        Content
                                    </h4>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="subfolders">Include subfolders</Label>
                                        <Switch
                                            id="subfolders"
                                            checked={config.include_subfolders}
                                            onCheckedChange={(v) => setConfig({ ...config, include_subfolders: v })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="versions">Include versions</Label>
                                        <Switch
                                            id="versions"
                                            checked={config.include_versions}
                                            onCheckedChange={(v) => setConfig({ ...config, include_versions: v })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Duplicate handling</Label>
                                        <Select
                                            value={config.duplicate_policy}
                                            onValueChange={(v: any) => setConfig({ ...config, duplicate_policy: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="keep_both">Keep both (add suffix)</SelectItem>
                                                <SelectItem value="dedupe_checksum">Dedupe by checksum</SelectItem>
                                                <SelectItem value="version_it">Create new version</SelectItem>
                                                <SelectItem value="skip">Skip duplicates</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Security Options */}
                            <Card>
                                <CardContent className="pt-4 space-y-4">
                                    <h4 className="font-medium flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        Security
                                    </h4>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="permissions">Migrate permissions</Label>
                                        <Switch
                                            id="permissions"
                                            checked={config.include_permissions}
                                            onCheckedChange={(v) => setConfig({ ...config, include_permissions: v })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="dryrun">Dry run (no changes)</Label>
                                        <Switch
                                            id="dryrun"
                                            checked={config.dry_run}
                                            onCheckedChange={(v) => setConfig({ ...config, dry_run: v })}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Performance Options */}
                            <Card className="col-span-2">
                                <CardContent className="pt-4 space-y-4">
                                    <h4 className="font-medium flex items-center gap-2">
                                        <Zap className="h-4 w-4" />
                                        Performance
                                    </h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <Label>Concurrency (parallel workers)</Label>
                                            <span className="text-sm text-muted-foreground">{config.concurrency}</span>
                                        </div>
                                        <Slider
                                            value={[config.concurrency]}
                                            onValueChange={([v]) => setConfig({ ...config, concurrency: v })}
                                            min={1}
                                            max={20}
                                            step={1}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Higher = faster, but may hit rate limits
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label htmlFor="delta">Delta mode</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Only sync changes since last run
                                            </p>
                                        </div>
                                        <Switch
                                            id="delta"
                                            checked={config.delta_mode}
                                            onCheckedChange={(v) => setConfig({ ...config, delta_mode: v })}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {step < 3 ? (
                        <Button
                            onClick={() => setStep(step + 1)}
                            disabled={step === 2 && !name}
                        >
                            Next
                        </Button>
                    ) : (
                        <Button onClick={handleSubmit} disabled={isLoading || !name}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Migration'
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
