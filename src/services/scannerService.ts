/**
 * Scanner Service - Handles document scanner detection and acquisition
 * Uses native browser capabilities and WIA (Windows Image Acquisition) when available
 */

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
  port?: number;
  lastSeen?: Date;
}

export interface ScanOptions {
  resolution?: number;
  colorMode?: 'color' | 'grayscale' | 'blackwhite';
  paperSize?: string;
  duplex?: boolean;
  format?: 'pdf' | 'jpeg' | 'png';
}

export interface ScannedDocument {
  id: string;
  data: Blob;
  fileName: string;
  mimeType: string;
  pageCount: number;
  timestamp: Date;
}

class ScannerService {
  private availableScanners: ScannerDevice[] = [];
  private isDetecting = false;

  constructor() {
    // Load saved network scanners from localStorage on initialization
    this.loadSavedScanners();
  }

  /**
   * Load saved network scanners from localStorage
   * Note: Scanners are loaded with 'offline' status - they need to be verified
   */
  private loadSavedScanners() {
    try {
      const saved = localStorage.getItem('network_scanners');
      if (saved) {
        const savedScanners = JSON.parse(saved) as ScannerDevice[];
        // Load with offline status - they will be verified when user opens scanner panel
        this.availableScanners = savedScanners.map(scanner => ({
          ...scanner,
          status: 'offline' as const, // Set to offline until verified
        }));
        console.log(`Loaded ${savedScanners.length} saved scanner(s) from localStorage (status: pending verification)`);
      }
    } catch (error) {
      console.error('Failed to load saved scanners:', error);
    }
  }

  /**
   * Detect available scanners
   * Uses multiple detection methods based on browser and OS support
   */
  async detectScanners(): Promise<ScannerDevice[]> {
    if (this.isDetecting) {
      console.log('Scanner detection already in progress');
      return this.availableScanners;
    }

    this.isDetecting = true;
    const detectedScanners: ScannerDevice[] = [];

    try {
      // Method 1: Check for Web TWAIN or SANE support (if installed)
      const twainScanners = await this.detectTWAINScanners();
      detectedScanners.push(...twainScanners);

      // Method 2: Check for network scanners via mDNS/Bonjour
      const networkScanners = await this.detectNetworkScanners();
      detectedScanners.push(...networkScanners);

      // Method 3: Check for Windows WIA devices (via native messaging if extension installed)
      if (navigator.platform.includes('Win')) {
        const wiaScanners = await this.detectWIAScanners();
        detectedScanners.push(...wiaScanners);
      }

      // Merge with saved network scanners (avoid duplicates)
      const savedNetworkScanners = this.availableScanners.filter(s => s.connectionType === 'network');
      for (const savedScanner of savedNetworkScanners) {
        const exists = detectedScanners.find(s => 
          s.id === savedScanner.id || 
          (s.ipAddress && s.ipAddress === savedScanner.ipAddress)
        );
        if (!exists) {
          detectedScanners.push(savedScanner);
        }
      }

      this.availableScanners = detectedScanners;
      console.log(`Total ${detectedScanners.length} scanner(s) available`);
      
      return detectedScanners;
    } catch (error) {
      console.error('Scanner detection failed:', error);
      return this.availableScanners; // Return saved scanners on error
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Detect TWAIN-compatible scanners
   * Requires Dynamsoft WebTWAIN or similar SDK to be installed
   */
  private async detectTWAINScanners(): Promise<ScannerDevice[]> {
    try {
      // Check if Dynamsoft WebTWAIN is available
      if (typeof (window as any).Dynamsoft !== 'undefined') {
        const DWObject = (window as any).Dynamsoft.DWT;
        if (DWObject) {
          const sourceCount = DWObject.SourceCount;
          const scanners: ScannerDevice[] = [];

          for (let i = 0; i < sourceCount; i++) {
            const sourceName = DWObject.GetSourceNameItems(i);
            scanners.push({
              id: `twain-${i}`,
              name: sourceName,
              manufacturer: 'Unknown',
              model: sourceName,
              connectionType: 'usb',
              status: 'online',
              capabilities: {
                maxResolution: 600,
                colorModes: ['color', 'grayscale', 'blackwhite'],
                paperSizes: ['A4', 'Letter', 'Legal'],
                duplex: true,
                adf: true,
              },
            });
          }

          return scanners;
        }
      }
    } catch (error) {
      console.warn('TWAIN scanner detection not available:', error);
    }

    return [];
  }

  /**
   * Detect network scanners
   * Scans local network for eSCL/AirScan compatible devices
   */
  private async detectNetworkScanners(): Promise<ScannerDevice[]> {
    const networkScanners: ScannerDevice[] = [];
    
    // Check localStorage for saved network scanners
    const savedScanners = localStorage.getItem('network_scanners');
    if (savedScanners) {
      try {
        const parsed = JSON.parse(savedScanners);
        const savedDevices = parsed.map((scanner: any) => ({
          ...scanner,
          status: 'online' as const,
          lastSeen: new Date(),
        }));
        networkScanners.push(...savedDevices);
      } catch (error) {
        console.warn('Failed to parse saved network scanners');
      }
    }

    // Try to discover scanners on common network ranges
    console.log('🌐 Scanning network for eSCL/AirScan devices...');
    const discoveredScanners = await this.scanNetworkForESCL();
    networkScanners.push(...discoveredScanners);

    // Remove duplicates based on IP address
    const uniqueScanners = Array.from(
      new Map(networkScanners.map(s => [s.ipAddress, s])).values()
    );

    return uniqueScanners;
  }

  /**
   * Scan network for eSCL-compatible scanners
   * This will discover devices on your local network
   */
  private async scanNetworkForESCL(): Promise<ScannerDevice[]> {
    const scanners: ScannerDevice[] = [];
    
    try {
      // Get local IP to determine network range
      const localIP = await this.getLocalIPAddress();
      if (!localIP) {
        console.log('⚠️ Could not determine local IP address for network scanning');
        return scanners;
      }

      console.log(`📍 Your IP: ${localIP}`);
      const networkPrefix = localIP.substring(0, localIP.lastIndexOf('.'));
      console.log(`🌐 Scanning network: ${networkPrefix}.1-254`);
      
      // Scan common scanner ports on local network
      const commonPorts = [80, 8080, 60000, 443]; // Common eSCL/network scanner ports
      const discoveredDevices: Map<string, ScannerDevice> = new Map();
      
      // Create scan promises for all IPs in the subnet
      const scanPromises: Promise<void>[] = [];
      
      // Scan IP range (last octet from 1-254)
      for (let i = 1; i <= 254; i++) {
        const ip = `${networkPrefix}.${i}`;
        
        // Skip our own IP
        if (ip === localIP) continue;
        
        for (const port of commonPorts) {
          const scanPromise = this.checkESCLScanner(ip, port)
            .then(scanner => {
              if (scanner) {
                // Use IP as key to avoid duplicates
                if (!discoveredDevices.has(scanner.ipAddress!)) {
                  discoveredDevices.set(scanner.ipAddress!, scanner);
                  console.log(`✅ Found scanner: ${scanner.name} at ${ip}:${port}`);
                }
              }
            })
            .catch(() => {
              // Ignore errors - device not responding
            });
          
          scanPromises.push(scanPromise);
        }
      }
      
      // Wait for all scans to complete (with timeout)
      console.log(`🔍 Scanning ${scanPromises.length} IP:port combinations...`);
      await Promise.race([
        Promise.allSettled(scanPromises),
        new Promise(resolve => setTimeout(resolve, 15000)) // 15 second timeout
      ]);
      
      scanners.push(...Array.from(discoveredDevices.values()));
      console.log(`✅ Network scan complete. Found ${scanners.length} device(s)`);
      
    } catch (error) {
      console.warn('Network scanning failed:', error);
    }

    return scanners;
  }

  /**
   * Get local IP address
   */
  private async getLocalIPAddress(): Promise<string | null> {
    try {
      // Use WebRTC to get local IP
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      return new Promise((resolve) => {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const ipRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/;
            const match = event.candidate.candidate.match(ipRegex);
            if (match) {
              pc.close();
              resolve(match[0]);
            }
          }
        };
        
        // Timeout after 2 seconds
        setTimeout(() => {
          pc.close();
          resolve(null);
        }, 2000);
      });
    } catch (error) {
      console.warn('Could not determine local IP:', error);
      return null;
    }
  }

  /**
   * Check if an IP:port combination has an eSCL scanner or network device
   */
  private async checkESCLScanner(ip: string, port: number): Promise<ScannerDevice | null> {
    try {
      const baseUrl = port === 443 ? `https://${ip}` : `http://${ip}:${port}`;
      
      // First try eSCL capabilities endpoint
      const response = await fetch(`${baseUrl}/eSCL/ScannerCapabilities`, {
        method: 'GET',
        mode: 'cors',
        signal: AbortSignal.timeout(800), // 800ms timeout per device
      });

      if (response.ok) {
        // Parse scanner capabilities XML
        const xml = await response.text();
        const name = this.extractFromXML(xml, 'MakeAndModel') || 
                     this.extractFromXML(xml, 'ModelName') ||
                     `Network Scanner (${ip})`;
        const manufacturer = this.extractFromXML(xml, 'Manufacturer') || 'Unknown';
        const serialNumber = this.extractFromXML(xml, 'SerialNumber') || '';
        
        return {
          id: `escl-${ip}-${port}`,
          name: `${name}${serialNumber ? ` [${serialNumber}]` : ''}`,
          manufacturer,
          model: name,
          connectionType: 'wireless',
          status: 'online',
          ipAddress: ip,
          capabilities: {
            maxResolution: parseInt(this.extractFromXML(xml, 'MaxResolution') || '600'),
            colorModes: this.parseColorModes(xml),
            paperSizes: this.parsePaperSizes(xml),
            duplex: xml.toLowerCase().includes('duplex'),
            adf: xml.toLowerCase().includes('adf') || xml.toLowerCase().includes('feeder'),
          },
          lastSeen: new Date(),
        };
      }
      
      // Try alternative eSCL status endpoint
      const statusResponse = await fetch(`${baseUrl}/eSCL/ScannerStatus`, {
        method: 'GET',
        mode: 'cors',
        signal: AbortSignal.timeout(800),
      });
      
      if (statusResponse.ok) {
        return {
          id: `escl-${ip}-${port}`,
          name: `eSCL Scanner at ${ip}`,
          manufacturer: 'Unknown',
          model: 'eSCL Compatible',
          connectionType: 'wireless',
          status: 'online',
          ipAddress: ip,
          capabilities: {
            maxResolution: 600,
            colorModes: ['color', 'grayscale'],
            paperSizes: ['A4', 'Letter'],
            duplex: false,
            adf: true,
          },
          lastSeen: new Date(),
        };
      }

    } catch (error) {
      // Device not responding or not a scanner
    }

    return null;
  }

  /**
   * Parse color modes from scanner capabilities XML
   */
  private parseColorModes(xml: string): ('color' | 'grayscale' | 'blackwhite')[] {
    const modes: ('color' | 'grayscale' | 'blackwhite')[] = [];
    const xmlLower = xml.toLowerCase();
    
    if (xmlLower.includes('rgb') || xmlLower.includes('color')) {
      modes.push('color');
    }
    if (xmlLower.includes('gray') || xmlLower.includes('grey')) {
      modes.push('grayscale');
    }
    if (xmlLower.includes('blackandwhite') || xmlLower.includes('binary')) {
      modes.push('blackwhite');
    }
    
    return modes.length > 0 ? modes : ['color', 'grayscale'];
  }

  /**
   * Parse paper sizes from scanner capabilities XML
   */
  private parsePaperSizes(xml: string): string[] {
    const sizes: string[] = [];
    const xmlLower = xml.toLowerCase();
    
    if (xmlLower.includes('a4')) sizes.push('A4');
    if (xmlLower.includes('letter')) sizes.push('Letter');
    if (xmlLower.includes('legal')) sizes.push('Legal');
    if (xmlLower.includes('a5')) sizes.push('A5');
    
    return sizes.length > 0 ? sizes : ['A4', 'Letter'];
  }

  /**
   * Extract value from XML string
   */
  private extractFromXML(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Detect Windows WIA scanners
   * Requires native messaging host or COM automation
   */
  private async detectWIAScanners(): Promise<ScannerDevice[]> {
    try {
      // Check if native messaging host is available
      const response = await fetch('http://localhost:9876/api/scanners', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const data = await response.json();
        return data.scanners || [];
      }
    } catch (error) {
      // Native host not available, that's okay
      console.warn('WIA scanner detection not available (native host not running)');
    }

    return [];
  }

  /**
   * Add a network scanner manually
   */
  async addNetworkScanner(ipAddress: string, name?: string): Promise<ScannerDevice> {
    // Validate IP address format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      throw new Error('Invalid IP address format. Please use format: 192.168.1.100');
    }

    // Check if scanner already exists (check both id and IP)
    const existing = this.availableScanners.find(s => 
      s.ipAddress === ipAddress || s.id === `network-${ipAddress}`
    );
    if (existing) {
      throw new Error(`Scanner at ${ipAddress} is already connected`);
    }

    // Try to get scanner info (may fail due to CORS, but we'll add anyway)
    let scannerInfo = {
      name: name || `Network Scanner (${ipAddress})`,
      manufacturer: 'Network',
      model: 'eSCL Scanner',
      capabilities: {
        maxResolution: 600,
        colorModes: ['color', 'grayscale'] as ('color' | 'grayscale' | 'blackwhite')[],
        paperSizes: ['A4', 'Letter'],
        duplex: false,
        adf: true,
      },
    };

    // Verify scanner exists at this IP address via backend
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/scanner/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress }),
        signal: AbortSignal.timeout(10000), // 10 second timeout for scanner verification
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if scanner was actually found
        if (!data.success) {
          throw new Error(data.error || `No scanner found at ${ipAddress}`);
        }
        
        if (data.scanner) {
          scannerInfo = { ...scannerInfo, ...data.scanner };
        }
      } else {
        throw new Error(`Failed to verify scanner: ${response.statusText}`);
      }
    } catch (e: any) {
      // Re-throw with informative message
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new Error(`Connection timed out. No scanner responding at ${ipAddress}. Please check that the scanner is online and the IP is correct.`);
      }
      throw new Error(e.message || `Unable to connect to scanner at ${ipAddress}. Please ensure it's an eSCL/AirPrint compatible scanner and is powered on.`);
    }

    const scanner: ScannerDevice = {
      id: `network-${ipAddress}`,
      name: scannerInfo.name,
      manufacturer: scannerInfo.manufacturer,
      model: scannerInfo.model,
      connectionType: 'network',
      status: 'online',
      ipAddress,
      port: scannerInfo.port || 80,
      capabilities: scannerInfo.capabilities,
      lastSeen: new Date(),
    };

    this.availableScanners.push(scanner);

    // Save to localStorage
    const savedScanners = this.availableScanners.filter(s => s.connectionType === 'network');
    localStorage.setItem('network_scanners', JSON.stringify(savedScanners));

    return scanner;
  }

  /**
   * Verify if a scanner is currently online/available
   * Makes a request to the backend to check scanner health
   */
  async verifyScannerOnline(scanner: ScannerDevice): Promise<boolean> {
    if (!scanner.ipAddress) {
      return false;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/scanner/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: scanner.ipAddress }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        return data.success === true;
      }
      return false;
    } catch (error) {
      console.log(`Scanner at ${scanner.ipAddress} is not responding`);
      return false;
    }
  }

  /**
   * Update scanner status in the list
   */
  updateScannerStatus(scannerId: string, status: ScannerDevice['status']) {
    const scanner = this.availableScanners.find(s => s.id === scannerId);
    if (scanner) {
      scanner.status = status;
    }
  }

  /**
   * Scan document using selected scanner
   */
  async scanDocument(
    scannerId: string,
    options: ScanOptions = {}
  ): Promise<ScannedDocument> {
    const scanner = this.availableScanners.find(s => s.id === scannerId);
    if (!scanner) {
      throw new Error('Scanner not found');
    }

    // Try different scanning methods based on availability
    try {
      // Method 1: Use Web TWAIN
      if (typeof (window as any).Dynamsoft !== 'undefined') {
        return await this.scanWithTWAIN(scanner, options);
      }

      // Method 2: Use native host
      if (scanner.connectionType === 'usb' || scanner.connectionType === 'wireless') {
        return await this.scanWithNativeHost(scanner, options);
      }

      // Method 3: Use network scanner API
      if (scanner.connectionType === 'network' && scanner.ipAddress) {
        return await this.scanWithNetworkAPI(scanner, options);
      }

      throw new Error('No scanning method available for this scanner');
    } catch (error) {
      console.error('Scanning failed:', error);
      throw error;
    }
  }

  /**
   * Scan using Dynamsoft WebTWAIN
   */
  private async scanWithTWAIN(
    scanner: ScannerDevice,
    options: ScanOptions
  ): Promise<ScannedDocument> {
    return new Promise((resolve, reject) => {
      try {
        const DWObject = (window as any).Dynamsoft.DWT.GetWebTwain('dwtcontrolContainer');
        
        if (!DWObject) {
          reject(new Error('TWAIN control not initialized'));
          return;
        }

        // Select scanner
        const sourceIndex = parseInt(scanner.id.replace('twain-', ''));
        DWObject.SelectSourceByIndex(sourceIndex);

        // Configure scan settings
        DWObject.IfShowUI = false;
        DWObject.Resolution = options.resolution || 300;
        DWObject.PixelType = this.getPixelType(options.colorMode);

        // Acquire image
        DWObject.AcquireImage(
          {},
          () => {
            // Success callback
            const imageCount = DWObject.HowManyImagesInBuffer;
            
            // Convert to blob
            DWObject.ConvertToBlob(
              [DWObject.CurrentImageIndexInBuffer],
              (window as any).Dynamsoft.DWT.EnumDWT_ImageType.IT_PDF,
              (blob: Blob) => {
                const doc: ScannedDocument = {
                  id: `scan-${Date.now()}`,
                  data: blob,
                  fileName: `scan-${Date.now()}.pdf`,
                  mimeType: 'application/pdf',
                  pageCount: imageCount,
                  timestamp: new Date(),
                };
                resolve(doc);
              },
              (errorCode: number, errorString: string) => {
                reject(new Error(`PDF conversion failed: ${errorString}`));
              }
            );
          },
          (errorCode: number, errorString: string) => {
            reject(new Error(`Scanning failed: ${errorString}`));
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Scan using native host (Windows WIA)
   */
  private async scanWithNativeHost(
    scanner: ScannerDevice,
    options: ScanOptions
  ): Promise<ScannedDocument> {
    try {
      const response = await fetch('http://localhost:9876/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scannerId: scanner.id,
          resolution: options.resolution || 300,
          colorMode: options.colorMode || 'color',
          format: options.format || 'pdf',
        }),
      });

      if (!response.ok) {
        throw new Error('Native host scan failed');
      }

      const blob = await response.blob();
      
      return {
        id: `scan-${Date.now()}`,
        data: blob,
        fileName: `scan-${Date.now()}.${options.format || 'pdf'}`,
        mimeType: blob.type,
        pageCount: 1,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error('Native host not available or scan failed');
    }
  }

  /**
   * Scan using network scanner API (via backend proxy to bypass CORS)
   */
  private async scanWithNetworkAPI(
    scanner: ScannerDevice,
    options: ScanOptions
  ): Promise<ScannedDocument> {
    if (!scanner.ipAddress) {
      throw new Error('Scanner IP address not available');
    }

    // Use backend proxy to bypass CORS
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    const url = `${backendUrl}/api/scanner/scan`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ipAddress: scanner.ipAddress,
          port: scanner.port || 80,
          resolution: options.resolution || 300,
          colorMode: options.colorMode || 'color',
          format: options.format || 'pdf',
          duplex: options.duplex || false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Network scan failed');
      }

      const blob = await response.blob();

      return {
        id: `scan-${Date.now()}`,
        data: blob,
        fileName: `scan-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        pageCount: 1,
        timestamp: new Date(),
      };
    } catch (error) {
      // Fall back to direct connection (might work in some cases)
      console.warn('Backend proxy scan failed, trying direct connection:', error);
      return this.scanWithNetworkAPIDirect(scanner, options);
    }
  }

  /**
   * Direct scan without backend proxy (may fail due to CORS)
   */
  private async scanWithNetworkAPIDirect(
    scanner: ScannerDevice,
    options: ScanOptions
  ): Promise<ScannedDocument> {
    if (!scanner.ipAddress) {
      throw new Error('Scanner IP address not available');
    }

    // Common network scanner APIs (eSCL/AirScan)
    const url = `http://${scanner.ipAddress}/eSCL/ScanJobs`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
        },
        body: this.buildScanJobXML(options),
      });

      if (!response.ok) {
        throw new Error('Network scan job creation failed');
      }

      // Get job location
      const location = response.headers.get('Location');
      if (!location) {
        throw new Error('No job location received');
      }

      // Wait for scan to complete and download
      const documentUrl = `${location}/NextDocument`;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for scanning

      const docResponse = await fetch(documentUrl);
      if (!docResponse.ok) {
        throw new Error('Failed to retrieve scanned document');
      }

      const blob = await docResponse.blob();

      return {
        id: `scan-${Date.now()}`,
        data: blob,
        fileName: `scan-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        pageCount: 1,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Network scanning failed: ${error}`);
    }
  }

  /**
   * Build eSCL scan job XML
   */
  private buildScanJobXML(options: ScanOptions): string {
    const resolution = options.resolution || 300;
    const colorMode = options.colorMode === 'color' ? 'RGB24' : 'Grayscale8';

    return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.0</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>3508</pwg:Height>
      <pwg:Width>2480</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <scan:DocumentFormat>application/pdf</scan:DocumentFormat>
  <scan:XResolution>${resolution}</scan:XResolution>
  <scan:YResolution>${resolution}</scan:YResolution>
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:CompressionFactor>25</scan:CompressionFactor>
</scan:ScanSettings>`;
  }

  /**
   * Get TWAIN pixel type from color mode
   */
  private getPixelType(colorMode?: string): number {
    switch (colorMode) {
      case 'blackwhite':
        return 0; // TWPT_BW
      case 'grayscale':
        return 1; // TWPT_GRAY
      case 'color':
      default:
        return 2; // TWPT_RGB
    }
  }

  /**
   * Get available scanners
   */
  getAvailableScanners(): ScannerDevice[] {
    return this.availableScanners;
  }

  /**
   * Clear cached scanners
   */
  clearCache(): void {
    this.availableScanners = [];
  }
}

// Export singleton instance
export const scannerService = new ScannerService();
