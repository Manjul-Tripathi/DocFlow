import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { scannerService } from '@/services/scannerService';
import {
  Scan,
  Settings,
  Wifi,
  Usb,
  Monitor,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Printer,
  Zap,
  HardDrive,
  Network,
  AlertTriangle,
  Trash2
} from 'lucide-react';

export interface ScannerDevice {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  connectionType: 'usb' | 'network' | 'wireless';
  status: 'online' | 'offline' | 'busy' | 'error';
  capabilities: {
    maxResolution: number;
    colorModes: ('color' | 'grayscale' | 'blackwhite')[];
    paperSizes: string[];
    duplex: boolean;
    adf: boolean;
    adfCapacity?: number;
  };
  ipAddress?: string;
  lastSeen?: Date;
}

export interface ScanSettings {
  resolution: number;
  colorMode: 'color' | 'grayscale' | 'blackwhite';
  paperSize: string;
  duplex: boolean;
  brightness: number;
  contrast: number;
  autoRotate: boolean;
  autoCrop: boolean;
  blankPageRemoval: boolean;
  deskew: boolean;
  outputFormat: 'pdf' | 'tiff' | 'jpeg' | 'png';
  compression: 'none' | 'lzw' | 'jpeg';
  multiPagePdf: boolean;
}

interface ScannerConfigurationPanelProps {
  onScannerSelect?: (scanner: ScannerDevice) => void;
  onSettingsChange?: (settings: ScanSettings) => void;
  selectedScanner?: ScannerDevice | null;
  currentSettings?: ScanSettings;
}

const defaultSettings: ScanSettings = {
  resolution: 300,
  colorMode: 'color',
  paperSize: 'A4',
  duplex: false,
  brightness: 0,
  contrast: 0,
  autoRotate: true,
  autoCrop: true,
  blankPageRemoval: true,
  deskew: true,
  outputFormat: 'pdf',
  compression: 'jpeg',
  multiPagePdf: true
};

export const ScannerConfigurationPanel: React.FC<ScannerConfigurationPanelProps> = ({
  onScannerSelect,
  onSettingsChange,
  selectedScanner,
  currentSettings = defaultSettings
}) => {
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [settings, setSettings] = useState<ScanSettings>(currentSettings);
  const [networkScannerIp, setNetworkScannerIp] = useState('');
  const [isAddingNetwork, setIsAddingNetwork] = useState(false);

  const [isVerifying, setIsVerifying] = useState(false);

  // Auto-detect scanners on mount and verify their status
  useEffect(() => {
    handleRefreshScanners();
  }, []);

  // Verify all saved scanners when component mounts
  const verifySavedScanners = async (scannersToVerify: ScannerDevice[]) => {
    setIsVerifying(true);
    const verificationPromises = scannersToVerify.map(async (scanner) => {
      if (scanner.connectionType === 'network' && scanner.ipAddress) {
        const isOnline = await scannerService.verifyScannerOnline(scanner);
        return { ...scanner, status: isOnline ? 'online' as const : 'offline' as const };
      }
      return scanner;
    });

    const verifiedScanners = await Promise.all(verificationPromises);
    setScanners(verifiedScanners);

    // Update scanner service with new statuses
    verifiedScanners.forEach(scanner => {
      scannerService.updateScannerStatus(scanner.id, scanner.status);
    });

    const onlineCount = verifiedScanners.filter(s => s.status === 'online').length;
    const offlineCount = verifiedScanners.filter(s => s.status === 'offline').length;

    if (verifiedScanners.length > 0) {
      if (onlineCount === verifiedScanners.length) {
        toast.success('All scanners online', {
          description: `${onlineCount} scanner(s) ready to use`,
        });
      } else if (onlineCount > 0) {
        toast.info('Scanner status', {
          description: `${onlineCount} online, ${offlineCount} offline`,
        });
      } else {
        toast.warning('Scanners offline', {
          description: `All ${offlineCount} saved scanner(s) are currently offline`,
        });
      }
    }

    setIsVerifying(false);
  };

  const handleRefreshScanners = async () => {
    setIsScanning(true);
    try {
      console.log('🔍 Detecting scanners...');
      const detectedScanners = await scannerService.detectScanners();
      
      setScanners(detectedScanners);
      
      // Verify network scanners
      if (detectedScanners.length > 0) {
        await verifySavedScanners(detectedScanners);
      }
      
      if (detectedScanners.length === 0) {
        console.log('⚠️ No scanners detected');
        toast.info('No scanners detected', {
          description: 'Please ensure your scanner is connected and drivers are installed.',
        });
      } else {
        console.log(`✅ Found ${detectedScanners.length} scanner(s)`);
      }
    } catch (error) {
      console.error('Scanner detection failed:', error);
      setScanners([]);
      toast.error('Scanner detection failed', {
        description: 'Check console for details.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddNetworkScanner = async () => {
    if (!networkScannerIp.trim()) {
      toast.error('Please enter a valid IP address');
      return;
    }

    setIsAddingNetwork(true);
    try {
      const newScanner = await scannerService.addNetworkScanner(networkScannerIp);
      setScanners(prev => [...prev, newScanner]);
      setNetworkScannerIp('');
      
      // Auto-select the newly added scanner
      onScannerSelect?.(newScanner);
      
      toast.success('Scanner connected successfully!', {
        description: `${newScanner.name} is ready. Click "Start Batch Scan" to begin scanning.`
      });
    } catch (error: any) {
      console.error('Failed to add network scanner:', error);
      toast.error('Failed to add scanner', {
        description: error.message || 'Please check the IP address and try again'
      });
    } finally {
      setIsAddingNetwork(false);
    }
  };

  const handleRemoveScanner = (scannerId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent scanner selection when clicking delete
    
    const scanner = scanners.find(s => s.id === scannerId);
    if (!scanner) return;

    // Remove from state
    setScanners(prev => prev.filter(s => s.id !== scannerId));
    
    // Remove from localStorage if it's a network scanner
    if (scanner.connectionType === 'network') {
      const savedScanners = scanners.filter(s => 
        s.connectionType === 'network' && s.id !== scannerId
      );
      localStorage.setItem('network_scanners', JSON.stringify(savedScanners));
    }
    
    // Deselect if this was the selected scanner
    if (selectedScanner?.id === scannerId) {
      onScannerSelect?.(null as any);
    }
    
    toast.success('Scanner removed', {
      description: `${scanner.name} has been disconnected`
    });
  };

  const checkScannerHealth = async (scanner: ScannerDevice) => {
    if (scanner.connectionType !== 'network' || !scanner.ipAddress) {
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/scanner/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: scanner.ipAddress }),
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Scanner is online
          setScanners(prev => prev.map(s => 
            s.id === scanner.id ? { ...s, status: 'online' as const } : s
          ));
        } else {
          // Scanner not found
          setScanners(prev => prev.map(s => 
            s.id === scanner.id ? { ...s, status: 'offline' as const } : s
          ));
          toast.warning(`Scanner ${scanner.name} is offline`, {
            description: data.error || 'Scanner is not responding'
          });
        }
      }
    } catch (e) {
      // Connection failed
      setScanners(prev => prev.map(s => 
        s.id === scanner.id ? { ...s, status: 'offline' as const } : s
      ));
    }
  };

  const refreshScannerStatus = async () => {
    if (scanners.length === 0) {
      toast.info('No scanners to check');
      return;
    }
    
    setIsVerifying(true);
    toast.info('Checking scanner status...');
    
    const verifiedScanners = await Promise.all(
      scanners.map(async (scanner) => {
        if (scanner.connectionType === 'network' && scanner.ipAddress) {
          const isOnline = await scannerService.verifyScannerOnline(scanner);
          return { ...scanner, status: isOnline ? 'online' as const : 'offline' as const };
        }
        return scanner;
      })
    );
    
    setScanners(verifiedScanners);
    
    // Deselect if selected scanner went offline
    if (selectedScanner && verifiedScanners.find(s => s.id === selectedScanner.id)?.status === 'offline') {
      onScannerSelect?.(null as any);
      toast.warning('Selected scanner is offline', {
        description: 'Please select an online scanner'
      });
    }
    
    const onlineCount = verifiedScanners.filter(s => s.status === 'online').length;
    if (onlineCount === verifiedScanners.length) {
      toast.success('All scanners online');
    } else if (onlineCount > 0) {
      toast.info(`${onlineCount} of ${verifiedScanners.length} scanners online`);
    } else {
      toast.warning('All scanners offline');
    }
    
    setIsVerifying(false);
  };

  const handleSettingChange = <K extends keyof ScanSettings>(key: K, value: ScanSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const getConnectionIcon = (type: ScannerDevice['connectionType']) => {
    switch (type) {
      case 'usb': return <Usb className="h-4 w-4" />;
      case 'network': return <Network className="h-4 w-4" />;
      case 'wireless': return <Wifi className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: ScannerDevice['status']) => {
    switch (status) {
      case 'online':
        return <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Online</Badge>;
      case 'offline':
        return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="h-3 w-3 mr-1" /> Offline</Badge>;
      case 'busy':
        return <Badge variant="default" className="bg-amber-500/10 text-amber-500 border-amber-500/20"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Busy</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Error</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="scanners" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="scanners" className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Scanners
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Scan Settings
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanners" className="space-y-4 mt-4">
          {/* Add Network Scanner - Now Primary */}
          <Card className="border-primary border-2">
            <CardHeader className="pb-3 bg-primary/5">
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-5 w-5 text-primary" />
                Connect Wi-Fi Scanner
              </CardTitle>
              <CardDescription>
                Enter your scanner's IP address to connect
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100 mb-2">⚠️ Browser Limitation</p>
                <p className="text-amber-700 dark:text-amber-300 text-xs">
                  Web browsers cannot auto-discover network scanners due to security restrictions. 
                  Please enter your scanner's IP address manually.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">📍 How to find your scanner's IP:</p>
                <ul className="text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc text-xs">
                  <li><b>Scanner Display:</b> Menu → Network Settings → TCP/IP</li>
                  <li><b>Print Config Page:</b> Hold Info/i button on scanner</li>
                  <li><b>Router Admin:</b> Check connected devices list</li>
                  <li><b>Scanner App:</b> HP Smart, Canon Print, Epson Smart Panel</li>
                </ul>
              </div>
              
              <div className="flex gap-3">
                <Input
                  placeholder="Scanner IP (e.g., 192.168.1.100)"
                  value={networkScannerIp}
                  onChange={(e) => setNetworkScannerIp(e.target.value)}
                  className="flex-1 text-lg font-mono"
                />
                <Button 
                  onClick={handleAddNetworkScanner}
                  disabled={isAddingNetwork || !networkScannerIp.trim()}
                  size="lg"
                >
                  {isAddingNetwork ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Wifi className="h-4 w-4 mr-2" />
                  )}
                  Connect
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Works with HP, Canon, Epson, Brother, and other eSCL/AirPrint compatible scanners
              </p>
            </CardContent>
          </Card>

          {/* Scanner Discovery - Secondary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Scan className="h-5 w-5 text-primary" />
                    Connected Scanners
                  </CardTitle>
                  <CardDescription>
                    Scanners you've added will appear here
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshScannerStatus}
                    disabled={isScanning || isVerifying || scanners.length === 0}
                    title="Check scanner status"
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshScanners}
                    disabled={isScanning || isVerifying}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isScanning || isVerifying ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isVerifying && (
                <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-700 dark:text-blue-300">Verifying scanner status...</span>
                </div>
              )}
              
              {scanners.map((scanner) => (
                <div
                  key={scanner.id}
                  className={`p-4 border rounded-lg transition-all ${
                    scanner.status === 'online' 
                      ? 'cursor-pointer hover:border-primary/50' 
                      : 'cursor-not-allowed'
                  } ${
                    selectedScanner?.id === scanner.id 
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                      : 'border-border'
                  } ${scanner.status !== 'online' ? 'opacity-60 bg-muted/30' : ''}`}
                  onClick={() => {
                    if (scanner.status === 'online') {
                      onScannerSelect?.(scanner);
                    } else {
                      toast.error('Scanner is offline', {
                        description: 'Turn on the scanner and click Refresh to reconnect'
                      });
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 rounded-lg bg-muted">
                        <Monitor className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium flex items-center gap-2">
                          {scanner.name}
                          {selectedScanner?.id === scanner.id && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {scanner.manufacturer} • {scanner.model}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {getConnectionIcon(scanner.connectionType)}
                            {scanner.connectionType.charAt(0).toUpperCase() + scanner.connectionType.slice(1)}
                          </span>
                          {scanner.ipAddress && (
                            <span>IP: {scanner.ipAddress}</span>
                          )}
                          {scanner.capabilities.adf && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              ADF ({scanner.capabilities.adfCapacity} sheets)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(scanner.status)}
                      <span className="text-xs text-muted-foreground">
                        Max {scanner.capabilities.maxResolution} DPI
                      </span>
                      {scanner.connectionType === 'network' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleRemoveScanner(scanner.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {selectedScanner && scanners.length > 0 && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-900 dark:text-green-100 text-sm">
                        Scanner Ready!
                      </p>
                      <p className="text-green-700 dark:text-green-300 text-xs mt-1">
                        <strong>{selectedScanner.name}</strong> is selected. Configure scan settings in the tabs above, then click <strong>"Start Batch Scan"</strong> button (on the left panel) to begin scanning documents.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isScanning && (
                <div className="text-center py-12">
                  <Loader2 className="h-12 w-12 mx-auto mb-3 animate-spin text-primary" />
                  <p className="font-medium mb-2">Scanning your network...</p>
                  <p className="text-sm text-muted-foreground">
                    Checking all devices on your local network for scanners
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    This may take 10-15 seconds
                  </p>
                </div>
              )}

              {scanners.length === 0 && !isScanning && (
                <div className="text-center py-8 px-6">
                  <div className="rounded-full bg-muted p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                    <Printer className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No scanners connected yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the form above to connect your Wi-Fi scanner
                  </p>
                </div>
              )}

              {isScanning && scanners.length === 0 && (
                <div className="text-center py-12">
                  <Loader2 className="h-12 w-12 mx-auto mb-3 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Checking for scanners...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scan Quality</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Resolution */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Resolution (DPI)</Label>
                  <span className="text-sm font-medium">{settings.resolution} DPI</span>
                </div>
                <Slider
                  value={[settings.resolution]}
                  onValueChange={([value]) => handleSettingChange('resolution', value)}
                  min={75}
                  max={1200}
                  step={75}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Draft (75)</span>
                  <span>Standard (300)</span>
                  <span>High (600)</span>
                  <span>Max (1200)</span>
                </div>
              </div>

              {/* Color Mode */}
              <div className="space-y-2">
                <Label>Color Mode</Label>
                <Select
                  value={settings.colorMode}
                  onValueChange={(value: ScanSettings['colorMode']) => handleSettingChange('colorMode', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">Full Color (24-bit)</SelectItem>
                    <SelectItem value="grayscale">Grayscale (8-bit)</SelectItem>
                    <SelectItem value="blackwhite">Black & White (1-bit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Paper Size */}
              <div className="space-y-2">
                <Label>Paper Size</Label>
                <Select
                  value={settings.paperSize}
                  onValueChange={(value) => handleSettingChange('paperSize', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                    <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                    <SelectItem value="Letter">Letter (8.5 × 11 in)</SelectItem>
                    <SelectItem value="Legal">Legal (8.5 × 14 in)</SelectItem>
                    <SelectItem value="Auto">Auto Detect</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Brightness & Contrast */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Brightness</Label>
                    <span className="text-sm">{settings.brightness > 0 ? '+' : ''}{settings.brightness}</span>
                  </div>
                  <Slider
                    value={[settings.brightness]}
                    onValueChange={([value]) => handleSettingChange('brightness', value)}
                    min={-50}
                    max={50}
                    step={5}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Contrast</Label>
                    <span className="text-sm">{settings.contrast > 0 ? '+' : ''}{settings.contrast}</span>
                  </div>
                  <Slider
                    value={[settings.contrast]}
                    onValueChange={([value]) => handleSettingChange('contrast', value)}
                    min={-50}
                    max={50}
                    step={5}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Output Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>File Format</Label>
                <Select
                  value={settings.outputFormat}
                  onValueChange={(value: ScanSettings['outputFormat']) => handleSettingChange('outputFormat', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF Document</SelectItem>
                    <SelectItem value="tiff">TIFF Image</SelectItem>
                    <SelectItem value="jpeg">JPEG Image</SelectItem>
                    <SelectItem value="png">PNG Image</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.outputFormat === 'pdf' && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Multi-page PDF</Label>
                    <p className="text-xs text-muted-foreground">Combine all pages into one PDF</p>
                  </div>
                  <Switch
                    checked={settings.multiPagePdf}
                    onCheckedChange={(checked) => handleSettingChange('multiPagePdf', checked)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Compression</Label>
                <Select
                  value={settings.compression}
                  onValueChange={(value: ScanSettings['compression']) => handleSettingChange('compression', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Largest file size)</SelectItem>
                    <SelectItem value="lzw">LZW (Lossless)</SelectItem>
                    <SelectItem value="jpeg">JPEG (Smallest file size)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scanning Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Duplex Scanning</Label>
                  <p className="text-xs text-muted-foreground">Scan both sides of the page</p>
                </div>
                <Switch
                  checked={settings.duplex}
                  onCheckedChange={(checked) => handleSettingChange('duplex', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Rotate</Label>
                  <p className="text-xs text-muted-foreground">Automatically correct page orientation</p>
                </div>
                <Switch
                  checked={settings.autoRotate}
                  onCheckedChange={(checked) => handleSettingChange('autoRotate', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Crop</Label>
                  <p className="text-xs text-muted-foreground">Automatically detect and crop page borders</p>
                </div>
                <Switch
                  checked={settings.autoCrop}
                  onCheckedChange={(checked) => handleSettingChange('autoCrop', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Deskew</Label>
                  <p className="text-xs text-muted-foreground">Straighten tilted pages automatically</p>
                </div>
                <Switch
                  checked={settings.deskew}
                  onCheckedChange={(checked) => handleSettingChange('deskew', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Blank Page Removal</Label>
                  <p className="text-xs text-muted-foreground">Automatically remove blank pages</p>
                </div>
                <Switch
                  checked={settings.blankPageRemoval}
                  onCheckedChange={(checked) => handleSettingChange('blankPageRemoval', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quick Presets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Presets</CardTitle>
              <CardDescription>Apply common scanning configurations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col"
                  onClick={() => {
                    const preset: ScanSettings = {
                      ...defaultSettings,
                      resolution: 150,
                      colorMode: 'grayscale',
                      compression: 'jpeg'
                    };
                    setSettings(preset);
                    onSettingsChange?.(preset);
                    toast.success('Applied "Quick Scan" preset');
                  }}
                >
                  <Zap className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Quick Scan</span>
                  <span className="text-xs text-muted-foreground">150 DPI, Grayscale</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col"
                  onClick={() => {
                    const preset: ScanSettings = {
                      ...defaultSettings,
                      resolution: 300,
                      colorMode: 'color',
                      compression: 'jpeg'
                    };
                    setSettings(preset);
                    onSettingsChange?.(preset);
                    toast.success('Applied "Document" preset');
                  }}
                >
                  <HardDrive className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Document</span>
                  <span className="text-xs text-muted-foreground">300 DPI, Color</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col"
                  onClick={() => {
                    const preset: ScanSettings = {
                      ...defaultSettings,
                      resolution: 600,
                      colorMode: 'color',
                      compression: 'lzw'
                    };
                    setSettings(preset);
                    onSettingsChange?.(preset);
                    toast.success('Applied "Photo" preset');
                  }}
                >
                  <Monitor className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Photo</span>
                  <span className="text-xs text-muted-foreground">600 DPI, Lossless</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col"
                  onClick={() => {
                    const preset: ScanSettings = {
                      ...defaultSettings,
                      resolution: 1200,
                      colorMode: 'color',
                      compression: 'none'
                    };
                    setSettings(preset);
                    onSettingsChange?.(preset);
                    toast.success('Applied "Archive" preset');
                  }}
                >
                  <HardDrive className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">Archive</span>
                  <span className="text-xs text-muted-foreground">1200 DPI, No compression</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ScannerConfigurationPanel;
