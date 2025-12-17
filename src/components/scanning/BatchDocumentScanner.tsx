import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { scannerService } from '@/services/scannerService';
import {
  Scan,
  Play,
  Pause,
  StopCircle,
  RotateCcw,
  RotateCw,
  Trash2,
  Download,
  Upload,
  FolderOpen,
  FileText,
  Image,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  ZoomIn,
  ZoomOut,
  Settings,
  Layers,
  Copy,
  Move,
  ArrowUp,
  ArrowDown,
  SplitSquareVertical,
  Merge,
  AlertTriangle,
  Plus,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { ScannerConfigurationPanel, ScannerDevice, ScanSettings } from './ScannerConfigurationPanel';

interface ScannedPage {
  id: string;
  pageNumber: number;
  thumbnail: string;
  fullImage: string;
  status: 'pending' | 'scanning' | 'processing' | 'complete' | 'error';
  fileName: string;
  fileSize: number;
  dimensions: { width: number; height: number };
  rotation: number;
  isBlank: boolean;
  ocrText?: string;
  errorMessage?: string;
}

interface ScanBatch {
  id: string;
  name: string;
  createdAt: Date;
  pages: ScannedPage[];
  status: 'idle' | 'scanning' | 'paused' | 'processing' | 'complete' | 'error';
  settings: ScanSettings;
  totalPages: number;
  scannedPages: number;
}

interface BatchDocumentScannerProps {
  onBatchComplete?: (batch: ScanBatch) => void;
  onUploadToStorage?: (pages: ScannedPage[]) => Promise<void>;
}

// Generate placeholder images for demo
const generatePlaceholderImage = (pageNum: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 200, 280);
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(10, 10, 180, 260);
    ctx.fillStyle = '#6c757d';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageNum}`, 100, 145);
  }
  return canvas.toDataURL();
};

export const BatchDocumentScanner: React.FC<BatchDocumentScannerProps> = ({
  onBatchComplete,
  onUploadToStorage
}) => {
  const [selectedScanner, setSelectedScanner] = useState<ScannerDevice | null>(null);
  const [scanSettings, setScanSettings] = useState<ScanSettings>({
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
  });
  const [currentBatch, setCurrentBatch] = useState<ScanBatch | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [previewPage, setPreviewPage] = useState<ScannedPage | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [zoom, setZoom] = useState(100);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const createNewBatch = () => {
    const batch: ScanBatch = {
      id: `batch-${Date.now()}`,
      name: batchName || `Scan Batch ${new Date().toLocaleString()}`,
      createdAt: new Date(),
      pages: [],
      status: 'idle',
      settings: scanSettings,
      totalPages: 0,
      scannedPages: 0
    };
    setCurrentBatch(batch);
    setBatchName('');
    setSelectedPages(new Set());
  };

  const simulateScan = useCallback(() => {
    if (!currentBatch || isPaused) return;

    const pageNum = currentBatch.pages.length + 1;
    const newPage: ScannedPage = {
      id: `page-${Date.now()}`,
      pageNumber: pageNum,
      thumbnail: generatePlaceholderImage(pageNum),
      fullImage: generatePlaceholderImage(pageNum),
      status: 'complete',
      fileName: `scan_${pageNum.toString().padStart(3, '0')}.${scanSettings.outputFormat}`,
      fileSize: Math.floor(Math.random() * 500000) + 100000,
      dimensions: { width: 2480, height: 3508 },
      rotation: 0,
      isBlank: false
    };

    setCurrentBatch(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: [...prev.pages, newPage],
        scannedPages: prev.scannedPages + 1,
        totalPages: prev.totalPages + 1
      };
    });
  }, [currentBatch, isPaused, scanSettings.outputFormat]);

  const startScanning = async () => {
    if (!selectedScanner) {
      toast.error('Please select a scanner first');
      return;
    }

    if (!currentBatch) {
      createNewBatch();
    }

    setIsScanning(true);
    setIsPaused(false);
    
    setCurrentBatch(prev => prev ? { ...prev, status: 'scanning' } : prev);

    toast.info('Starting scan...', {
      description: 'Initializing scanner connection'
    });

    try {
      // Perform actual scan using scanner service
      const scannedDoc = await scannerService.scanDocument(selectedScanner.id, {
        resolution: scanSettings.resolution,
        colorMode: scanSettings.colorMode,
        paperSize: scanSettings.paperSize,
        duplex: scanSettings.duplex,
        format: scanSettings.outputFormat,
      });

      // Convert blob to data URL for preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const pageNum = (currentBatch?.pages.length || 0) + 1;

        const newPage: ScannedPage = {
          id: scannedDoc.id,
          pageNumber: pageNum,
          thumbnail: dataUrl,
          fullImage: dataUrl,
          status: 'complete',
          fileName: scannedDoc.fileName,
          fileSize: scannedDoc.data.size,
          dimensions: { width: 2480, height: 3508 },
          rotation: 0,
          isBlank: false,
        };

        setCurrentBatch(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: [...prev.pages, newPage],
            scannedPages: prev.scannedPages + 1,
            totalPages: prev.totalPages + 1,
            status: 'idle',
          };
        });

        toast.success('Document scanned successfully', {
          description: `${scannedDoc.fileName} (${(scannedDoc.data.size / 1024).toFixed(1)} KB)`,
        });
      };

      reader.readAsDataURL(scannedDoc.data);

    } catch (error) {
      console.error('Scanning failed:', error);
      toast.error('Scanning failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      
      setCurrentBatch(prev => prev ? { ...prev, status: 'error' } : prev);
    } finally {
      setIsScanning(false);
    }
  };

  const pauseScanning = () => {
    setIsPaused(true);
    setCurrentBatch(prev => prev ? { ...prev, status: 'paused' } : prev);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    toast.info('Scanning paused');
  };

  const resumeScanning = () => {
    setIsPaused(false);
    setCurrentBatch(prev => prev ? { ...prev, status: 'scanning' } : prev);
    scanIntervalRef.current = setInterval(() => {
      simulateScan();
    }, 1500);
    toast.success('Scanning resumed');
  };

  const stopScanning = () => {
    setIsScanning(false);
    setIsPaused(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    setCurrentBatch(prev => prev ? { ...prev, status: 'complete' } : prev);
    toast.success('Scanning complete', {
      description: `${currentBatch?.pages.length || 0} pages scanned`
    });
    
    if (currentBatch && onBatchComplete) {
      onBatchComplete(currentBatch);
    }
  };

  const uploadScannedDocuments = async () => {
    if (!currentBatch || currentBatch.pages.length === 0) {
      toast.error('No pages to upload');
      return;
    }

    if (onUploadToStorage) {
      try {
        toast.info('Uploading scanned documents...', {
          description: `Uploading ${currentBatch.pages.length} page(s)`,
        });

        await onUploadToStorage(currentBatch.pages);

        toast.success('Documents uploaded successfully', {
          description: `${currentBatch.pages.length} page(s) uploaded to storage`,
        });

        // Clear current batch after successful upload
        setCurrentBatch(null);
        setSelectedPages(new Set());
      } catch (error) {
        console.error('Upload failed:', error);
        toast.error('Upload failed', {
          description: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    } else {
      toast.info('Upload handler not configured');
    }
  };

  const scanSinglePage = () => {
    if (!selectedScanner) {
      toast.error('Please select a scanner first');
      return;
    }

    if (!currentBatch) {
      createNewBatch();
    }

    simulateScan();
    toast.success('Page scanned');
  };

  const togglePageSelection = (pageId: string) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageId)) {
        newSet.delete(pageId);
      } else {
        newSet.add(pageId);
      }
      return newSet;
    });
  };

  const selectAllPages = () => {
    if (!currentBatch) return;
    setSelectedPages(new Set(currentBatch.pages.map(p => p.id)));
  };

  const deselectAllPages = () => {
    setSelectedPages(new Set());
  };

  const deleteSelectedPages = () => {
    if (!currentBatch || selectedPages.size === 0) return;
    
    setCurrentBatch(prev => {
      if (!prev) return prev;
      const remainingPages = prev.pages.filter(p => !selectedPages.has(p.id));
      return {
        ...prev,
        pages: remainingPages.map((p, idx) => ({ ...p, pageNumber: idx + 1 })),
        totalPages: remainingPages.length,
        scannedPages: remainingPages.length
      };
    });
    
    setSelectedPages(new Set());
    toast.success(`${selectedPages.size} page(s) deleted`);
  };

  const rotatePage = (pageId: string, direction: 'cw' | 'ccw') => {
    setCurrentBatch(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(p => {
          if (p.id === pageId) {
            const rotation = direction === 'cw' 
              ? (p.rotation + 90) % 360 
              : (p.rotation - 90 + 360) % 360;
            return { ...p, rotation };
          }
          return p;
        })
      };
    });
  };

  const movePage = (pageId: string, direction: 'up' | 'down') => {
    if (!currentBatch) return;
    
    const pageIndex = currentBatch.pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;
    
    const newIndex = direction === 'up' ? pageIndex - 1 : pageIndex + 1;
    if (newIndex < 0 || newIndex >= currentBatch.pages.length) return;
    
    setCurrentBatch(prev => {
      if (!prev) return prev;
      const newPages = [...prev.pages];
      [newPages[pageIndex], newPages[newIndex]] = [newPages[newIndex], newPages[pageIndex]];
      return {
        ...prev,
        pages: newPages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }))
      };
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleUpload = async () => {
    if (!currentBatch || currentBatch.pages.length === 0) return;
    
    try {
      if (onUploadToStorage) {
        await onUploadToStorage(currentBatch.pages);
      }
      toast.success('Documents uploaded successfully', {
        description: `${currentBatch.pages.length} pages uploaded to SimplifyDrive`
      });
    } catch (error) {
      toast.error('Upload failed', {
        description: 'Please try again'
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Scan className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Batch Document Scanner</h2>
            <p className="text-sm text-muted-foreground">
              {selectedScanner ? `Connected: ${selectedScanner.name}` : 'No scanner selected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Scanner Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Scanner Configuration</DialogTitle>
                <DialogDescription>
                  Configure scanner connection and scan settings
                </DialogDescription>
              </DialogHeader>
              <ScannerConfigurationPanel
                selectedScanner={selectedScanner}
                onScannerSelect={setSelectedScanner}
                currentSettings={scanSettings}
                onSettingsChange={setScanSettings}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-80 border-r flex flex-col">
          {/* Batch Info */}
          <div className="p-4 border-b space-y-4">
            <div className="space-y-2">
              <Label>Batch Name</Label>
              <Input
                placeholder="Enter batch name..."
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                disabled={isScanning}
              />
            </div>

            {currentBatch && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={
                    currentBatch.status === 'scanning' ? 'default' :
                    currentBatch.status === 'complete' ? 'secondary' :
                    currentBatch.status === 'paused' ? 'outline' : 'secondary'
                  }>
                    {currentBatch.status.charAt(0).toUpperCase() + currentBatch.status.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pages Scanned</span>
                  <span className="font-medium">{currentBatch.pages.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Size</span>
                  <span className="font-medium">
                    {formatFileSize(currentBatch.pages.reduce((sum, p) => sum + p.fileSize, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Scan Controls */}
          <div className="p-4 border-b space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {!isScanning ? (
                <>
                  <Button onClick={startScanning} className="col-span-2">
                    <Play className="h-4 w-4 mr-2" />
                    Start Batch Scan
                  </Button>
                  <Button variant="outline" onClick={scanSinglePage} className="col-span-2">
                    <Scan className="h-4 w-4 mr-2" />
                    Scan Single Page
                  </Button>
                </>
              ) : (
                <>
                  {isPaused ? (
                    <Button onClick={resumeScanning} className="col-span-1">
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseScanning} variant="outline" className="col-span-1">
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </Button>
                  )}
                  <Button onClick={stopScanning} variant="destructive" className="col-span-1">
                    <StopCircle className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </>
              )}
            </div>

            {isScanning && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isPaused ? 'Paused...' : 'Scanning in progress...'}
                </div>
              </div>
            )}
          </div>

          {/* Quick Settings */}
          <div className="p-4 border-b space-y-3">
            <h3 className="text-sm font-medium">Quick Settings</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Resolution</span>
                <span>{scanSettings.resolution} DPI</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Color Mode</span>
                <span className="capitalize">{scanSettings.colorMode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paper Size</span>
                <span>{scanSettings.paperSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Duplex</span>
                <span>{scanSettings.duplex ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Page Actions */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Page Actions</h3>
              <span className="text-xs text-muted-foreground">
                {selectedPages.size} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={selectAllPages}
                disabled={!currentBatch || currentBatch.pages.length === 0}
              >
                Select All
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={deselectAllPages}
                disabled={selectedPages.size === 0}
              >
                Deselect
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={deleteSelectedPages}
                disabled={selectedPages.size === 0}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-auto p-4 border-t space-y-2">
            <Button 
              className="w-full" 
              onClick={handleUpload}
              disabled={!currentBatch || currentBatch.pages.length === 0 || isScanning}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload to SimplifyDrive
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              disabled={!currentBatch || currentBatch.pages.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Download as PDF
            </Button>
            <Button 
              variant="ghost" 
              className="w-full"
              onClick={() => {
                setCurrentBatch(null);
                setSelectedPages(new Set());
              }}
              disabled={isScanning}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
          </div>
        </div>

        {/* Center Panel - Page Thumbnails */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setZoom(Math.max(50, zoom - 25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-12 text-center">{zoom}%</span>
              <Button variant="ghost" size="sm" onClick={() => setZoom(Math.min(200, zoom + 25))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={selectedPages.size !== 1}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={selectedPages.size !== 1}>
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={selectedPages.size !== 1}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={selectedPages.size !== 1}>
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Thumbnails Grid */}
          <ScrollArea className="flex-1 p-4">
            {!currentBatch || currentBatch.pages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Layers className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">No pages scanned yet</p>
                <p className="text-sm">Start scanning to see pages here</p>
              </div>
            ) : (
              <div 
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${100 * zoom / 100}px, 1fr))`
                }}
              >
                {currentBatch.pages.map((page) => (
                  <div
                    key={page.id}
                    className={`relative group cursor-pointer rounded-lg border-2 transition-all ${
                      selectedPages.has(page.id) 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => togglePageSelection(page.id)}
                    onDoubleClick={() => setPreviewPage(page)}
                  >
                    {/* Checkbox */}
                    <div className="absolute top-2 left-2 z-10">
                      <Checkbox
                        checked={selectedPages.has(page.id)}
                        onCheckedChange={() => togglePageSelection(page.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {/* Page Number */}
                    <div className="absolute top-2 right-2 z-10">
                      <Badge variant="secondary" className="text-xs">
                        {page.pageNumber}
                      </Badge>
                    </div>

                    {/* Thumbnail */}
                    <div 
                      className="aspect-[1/1.414] bg-muted rounded-lg overflow-hidden"
                      style={{ transform: `rotate(${page.rotation}deg)` }}
                    >
                      <img
                        src={page.thumbnail}
                        alt={`Page ${page.pageNumber}`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewPage(page);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          rotatePage(page.id, 'cw');
                        }}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentBatch(prev => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              pages: prev.pages.filter(p => p.id !== page.id)
                                .map((p, idx) => ({ ...p, pageNumber: idx + 1 }))
                            };
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Status Indicator */}
                    {page.status === 'scanning' && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-lg">
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                      </div>
                    )}

                    {/* File Info */}
                    <div className="p-2 text-xs text-muted-foreground truncate">
                      {formatFileSize(page.fileSize)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel - Preview */}
        {previewPage && (
          <div className="w-96 border-l flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="font-medium">Page Preview</h3>
              <Button variant="ghost" size="sm" onClick={() => setPreviewPage(null)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 p-4 flex flex-col">
              <div 
                className="flex-1 bg-muted rounded-lg overflow-hidden flex items-center justify-center"
                style={{ transform: `rotate(${previewPage.rotation}deg)` }}
              >
                <img
                  src={previewPage.fullImage}
                  alt={`Page ${previewPage.pageNumber}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Page</span>
                  <span>{previewPage.pageNumber}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Size</span>
                  <span>{formatFileSize(previewPage.fileSize)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Dimensions</span>
                  <span>{previewPage.dimensions.width} × {previewPage.dimensions.height}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rotation</span>
                  <span>{previewPage.rotation}°</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => rotatePage(previewPage.id, 'ccw')}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Rotate Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => rotatePage(previewPage.id, 'cw')}
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    Rotate Right
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchDocumentScanner;
