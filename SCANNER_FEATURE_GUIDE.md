# Scanner Feature Testing Guide

## Overview
The Scan button now supports document scanning with real scanner detection and document upload capabilities.

## Features Implemented

### 1. **Scanner Detection**
- Automatic detection of available scanners on page load
- Multiple detection methods:
  - **TWAIN-compatible scanners** (requires Dynamsoft WebTWAIN SDK)
  - **Network scanners** via eSCL/AirScan protocol
  - **Windows WIA scanners** via native messaging host (optional)
  - **Manual network scanner addition** by IP address

### 2. **Scanning Capabilities**
- Single page scanning
- Batch scanning (continuous feed)
- Configurable scan settings:
  - Resolution (150-1200 DPI)
  - Color mode (Color, Grayscale, Black & White)
  - Paper size (A4, Letter, Legal, etc.)
  - Duplex scanning (if supported)
  - Auto-rotate, auto-crop, blank page removal

### 3. **Document Upload**
- Scanned documents are automatically uploaded to Supabase storage
- Documents are registered in the database for processing
- Progress feedback during upload

## How to Use

### Basic Scanning (Demo Mode)

1. **Open Scanner Modal**
   - Click the "Scan" button next to the Upload button
   - The scanner dialog will open

2. **Select a Scanner**
   - Click "Scanner Settings" button
   - The panel will show available scanners (demo scanners if none detected)
   - Click on a scanner to select it

3. **Configure Settings** (Optional)
   - Adjust resolution, color mode, paper size
   - Enable/disable auto-rotate, auto-crop, etc.

4. **Scan Documents**
   - Click "Start Batch Scan" for continuous scanning
   - OR click "Scan Single Page" for one document at a time
   - Scanned pages will appear in the preview panel

5. **Upload to SimplifyDrive**
   - Review scanned pages
   - Click "Upload to SimplifyDrive" button
   - Documents will be uploaded and processed

### With Real Scanner Hardware

#### Method 1: Install Dynamsoft WebTWAIN SDK (Recommended)

1. Download and install [Dynamsoft WebTWAIN SDK](https://www.dynamsoft.com/web-twain/overview/)
2. Add the SDK to your project:
   ```bash
   npm install dwt
   ```
3. Include the SDK in your HTML:
   ```html
   <script src="path/to/dynamsoft.webtwain.min.js"></script>
   ```
4. Refresh the page - your USB/TWAIN scanners will be detected automatically

#### Method 2: Network Scanner (eSCL/AirScan)

1. Ensure your network scanner supports eSCL (most modern HP, Canon, Epson scanners)
2. Open Scanner Settings
3. Click "Add Network Scanner"
4. Enter the scanner's IP address (e.g., `192.168.1.100`)
5. Click "Add Scanner"
6. Select the newly added scanner and start scanning

#### Method 3: Native Messaging Host (Windows WIA)

1. Install the native messaging host (requires separate setup)
2. Run the host application:
   ```bash
   # Example host server on port 9876
   python scanner_host.py
   ```
3. Scanners will be auto-detected via WIA

## Scanner Service API

The scanner service is located at `src/services/scannerService.ts` and provides:

### Detection
```typescript
await scannerService.detectScanners();
```

### Scanning
```typescript
const scannedDoc = await scannerService.scanDocument(scannerId, {
  resolution: 300,
  colorMode: 'color',
  format: 'pdf'
});
```

### Add Network Scanner
```typescript
const scanner = await scannerService.addNetworkScanner('192.168.1.100', 'My Scanner');
```

## Troubleshooting

### No Scanners Detected
- **Check USB connection**: Ensure scanner is properly connected
- **Install drivers**: Make sure scanner drivers are installed
- **Check SDK**: Verify Dynamsoft WebTWAIN SDK is installed
- **Network scanner**: Confirm scanner is on the same network and IP is correct

### Scanning Fails
- **Check scanner status**: Ensure scanner is not in use by another application
- **Try different resolution**: Lower resolution may work better
- **Check paper feed**: Ensure documents are properly loaded in ADF

### Upload Fails
- **Check authentication**: Ensure you're logged in to SimplifyDrive
- **Check connection**: Verify internet connection is stable
- **Check storage quota**: Ensure you have storage space available

## Demo Mode

If no physical scanners are detected, the system will show demo scanners:
- HP ScanJet Pro 3000 (USB)
- Canon imageFORMULA DR-C225 (Network)
- Epson WorkForce ES-580W (Wireless)

These demo scanners allow you to test the UI without hardware.

## Architecture

```
┌─────────────────┐
│  Scan Button    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  BatchDocumentScanner   │
│  (UI Component)         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  ScannerService         │
│  - detectScanners()     │
│  - scanDocument()       │
│  - addNetworkScanner()  │
└────────┬────────────────┘
         │
         ├─── TWAIN (USB Scanners)
         ├─── eSCL/AirScan (Network)
         └─── WIA (Windows Native)
```

## Next Steps

1. **Test with actual scanner hardware**
2. **Install Dynamsoft WebTWAIN SDK** for production use
3. **Configure network scanners** for your office
4. **Customize scan settings** based on your needs

## Notes

- Scanner detection runs automatically when opening the scanner modal
- Network scanners are saved to localStorage for quick access
- Scanned documents are uploaded as pending and will be processed by the backend
- OCR and field extraction will run automatically after upload
