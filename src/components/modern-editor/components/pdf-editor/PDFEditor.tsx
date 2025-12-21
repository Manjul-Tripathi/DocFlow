import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { Loader2, AlertCircle, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PDFToolbar } from './components/PDFToolbar';
import type { ToolType, PageCanvas, HistoryState, PDFEditorProps } from './types';
import { PDF_BASE_SCALE, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from './constants';

// Set the worker source for PDF.js - use local worker from node_modules
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const PDFEditor: React.FC<PDFEditorProps> = ({
  documentId,
  documentName,
  pdfUrl: initialPdfUrl,
  onSave,
  onClose,
  readOnly = false,
}) => {
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl || null);
  const [currentTool, setCurrentTool] = useState<ToolType>('select');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [convertingToDocx, setConvertingToDocx] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const pageCanvasesRef = useRef<PageCanvas[]>([]);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const pdfLibDocRef = useRef<PDFDocument | null>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef(-1);
  const currentToolRef = useRef<ToolType>('select');
  const strokeColorRef = useRef('#000000');
  const fillColorRef = useRef('transparent');
  const strokeWidthRef = useRef(2);
  const fontSizeRef = useRef(16);
  const fontFamilyRef = useRef('Arial');
  const isBoldRef = useRef(false);
  const isItalicRef = useRef(false);
  const isUnderlineRef = useRef(false);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempShapeRef = useRef<fabric.Object | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep refs in sync with state
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { strokeColorRef.current = strokeColor; }, [strokeColor]);
  useEffect(() => { fillColorRef.current = fillColor; }, [fillColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { fontFamilyRef.current = fontFamily; }, [fontFamily]);
  useEffect(() => { isBoldRef.current = isBold; }, [isBold]);
  useEffect(() => { isItalicRef.current = isItalic; }, [isItalic]);
  useEffect(() => { isUnderlineRef.current = isUnderline; }, [isUnderline]);

  // Helper: Save canvas state to history
  const saveToHistory = useCallback((canvas: fabric.Canvas) => {
    const pageCanvas = pageCanvasesRef.current.find(pc => pc.fabricCanvas === canvas);
    if (!pageCanvas) return;

    const json = JSON.stringify(canvas.toJSON());
    const newState: HistoryState = {
      pageNum: pageCanvas.pageNum,
      json,
    };

    // Remove any future history if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(newState);
    historyIndexRef.current = historyRef.current.length - 1;
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  // Helper: Add text at position
  const addTextAtPosition = useCallback((canvas: fabric.Canvas, x: number, y: number) => {
    console.log('[PDFEditor] Adding text at position:', x, y);
    
    // Create text with empty initial content
    const text = new fabric.IText('', {
      left: x,
      top: y,
      fontSize: fontSizeRef.current,
      fontFamily: fontFamilyRef.current,
      fill: strokeColorRef.current,
      fontWeight: isBoldRef.current ? 'bold' : 'normal',
      fontStyle: isItalicRef.current ? 'italic' : 'normal',
      underline: isUnderlineRef.current,
      editable: true,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockUniScaling: false,
      cursorColor: strokeColorRef.current,
      cursorWidth: 2,
      editingBorderColor: '#2196F3',
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    
    // Use requestAnimationFrame to ensure canvas is ready before entering edit mode
    requestAnimationFrame(() => {
      text.enterEditing();
      // Place cursor at the end (which is the beginning since text is empty)
      text.setSelectionStart(0);
      text.setSelectionEnd(0);
      canvas.renderAll();
    });
    
    saveToHistory(canvas);
  }, [saveToHistory]);

  // Helper: Set up canvas events
  const setupCanvasEvents = useCallback((canvas: fabric.Canvas, pageNum: number) => {
    console.log(`[PDFEditor] Setting up events for page ${pageNum}`);

    // Mouse down - start drawing shapes or add text
    canvas.on('mouse:down', (opt) => {
      const pointer = canvas.getPointer(opt.e);
      const tool = currentToolRef.current;
      console.log(`[PDFEditor] Mouse down on page ${pageNum}, tool: ${tool}, pointer:`, pointer);

      if (tool === 'text') {
        // Check if we clicked on an existing object
        const target = canvas.findTarget(opt.e);
        if (!target) {
          // Add text at click position if not clicking on existing object
          addTextAtPosition(canvas, pointer.x, pointer.y);
        }
        return;
      }

      if (tool === 'pan') {
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
        return;
      }

      if (tool === 'eraser') {
        const target = canvas.findTarget(opt.e);
        if (target) {
          canvas.remove(target);
          canvas.renderAll();
          saveToHistory(canvas);
        }
        return;
      }

      // Start drawing shapes
      if (['rectangle', 'circle', 'line', 'arrow'].includes(tool)) {
        isDrawingRef.current = true;
        drawStartRef.current = { x: pointer.x, y: pointer.y };
        canvas.selection = false;

        let shape: fabric.Object | null = null;
        const fill = fillColorRef.current === 'transparent' ? undefined : fillColorRef.current;

        switch (tool) {
          case 'rectangle':
            shape = new fabric.Rect({
              left: pointer.x,
              top: pointer.y,
              width: 0,
              height: 0,
              fill: fill,
              stroke: strokeColorRef.current,
              strokeWidth: strokeWidthRef.current,
              selectable: false,
              evented: false,
            });
            break;
          case 'circle':
            shape = new fabric.Ellipse({
              left: pointer.x,
              top: pointer.y,
              rx: 0,
              ry: 0,
              fill: fill,
              stroke: strokeColorRef.current,
              strokeWidth: strokeWidthRef.current,
              selectable: false,
              evented: false,
            });
            break;
          case 'line':
            shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
              stroke: strokeColorRef.current,
              strokeWidth: strokeWidthRef.current,
              selectable: false,
              evented: false,
            });
            break;
          case 'arrow':
            shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
              stroke: strokeColorRef.current,
              strokeWidth: strokeWidthRef.current,
              selectable: false,
              evented: false,
            });
            break;
        }

        if (shape) {
          tempShapeRef.current = shape;
          canvas.add(shape);
          canvas.renderAll();
        }
      }
    });

    // Mouse move - resize shapes while drawing
    canvas.on('mouse:move', (opt) => {
      if (!isDrawingRef.current || !drawStartRef.current || !tempShapeRef.current) return;

      const pointer = canvas.getPointer(opt.e);
      const startX = drawStartRef.current.x;
      const startY = drawStartRef.current.y;
      const tool = currentToolRef.current;

      switch (tool) {
        case 'rectangle':
          const rect = tempShapeRef.current as fabric.Rect;
          const width = pointer.x - startX;
          const height = pointer.y - startY;
          rect.set({
            left: width < 0 ? pointer.x : startX,
            top: height < 0 ? pointer.y : startY,
            width: Math.abs(width),
            height: Math.abs(height),
          });
          break;
        case 'circle':
          const ellipse = tempShapeRef.current as fabric.Ellipse;
          const rx = Math.abs(pointer.x - startX) / 2;
          const ry = Math.abs(pointer.y - startY) / 2;
          ellipse.set({
            rx: rx,
            ry: ry,
            left: Math.min(startX, pointer.x),
            top: Math.min(startY, pointer.y),
          });
          break;
        case 'line':
        case 'arrow':
          const line = tempShapeRef.current as fabric.Line;
          line.set({ x2: pointer.x, y2: pointer.y });
          break;
      }

      canvas.renderAll();
    });

    // Mouse up - finish drawing
    canvas.on('mouse:up', () => {
      const tool = currentToolRef.current;
      
      if (isDrawingRef.current && tempShapeRef.current) {
        tempShapeRef.current.set({ 
          selectable: true,
          evented: true,
        });
        
        // For arrow, add arrowhead
        if (tool === 'arrow') {
          const line = tempShapeRef.current as fabric.Line;
          const x1 = line.x1 || 0;
          const y1 = line.y1 || 0;
          const x2 = line.x2 || 0;
          const y2 = line.y2 || 0;
          
          // Only add arrow if line has some length
          if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLength = 15;
            
            const arrowHead = new fabric.Triangle({
              left: x2,
              top: y2,
              width: headLength,
              height: headLength,
              fill: strokeColorRef.current,
              angle: (angle * 180 / Math.PI) + 90,
              originX: 'center',
              originY: 'center',
              selectable: true,
            });
            
            canvas.add(arrowHead);
          }
        }
        
        canvas.renderAll();
        saveToHistory(canvas);
      }

      isDrawingRef.current = false;
      drawStartRef.current = null;
      tempShapeRef.current = null;
      canvas.selection = true;
      canvas.defaultCursor = 'default';
    });

    // Object modified
    canvas.on('object:modified', () => {
      console.log(`[PDFEditor] Object modified on page ${pageNum}`);
      saveToHistory(canvas);
    });

    // Path created (for free drawing)
    canvas.on('path:created', () => {
      console.log(`[PDFEditor] Path created on page ${pageNum}`);
      saveToHistory(canvas);
    });
  }, [addTextAtPosition, saveToHistory]);

  // Update canvas settings when tool or colors change
  useEffect(() => {
    pageCanvasesRef.current.forEach(({ fabricCanvas }) => {
      // Update drawing mode
      if (currentTool === 'draw') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        if (fabricCanvas.freeDrawingBrush) {
          fabricCanvas.freeDrawingBrush.color = strokeColor;
          fabricCanvas.freeDrawingBrush.width = strokeWidth;
        }
      } else if (currentTool === 'highlight') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        if (fabricCanvas.freeDrawingBrush) {
          fabricCanvas.freeDrawingBrush.color = strokeColor + '66'; // Add transparency
          fabricCanvas.freeDrawingBrush.width = 20;
        }
      } else {
        fabricCanvas.isDrawingMode = false;
        // Enable selection for text and select tools
        fabricCanvas.selection = currentTool === 'select' || currentTool === 'text';
      }

      // Update cursor
      switch (currentTool) {
        case 'select':
          fabricCanvas.defaultCursor = 'default';
          fabricCanvas.hoverCursor = 'move';
          break;
        case 'pan':
          fabricCanvas.defaultCursor = 'grab';
          fabricCanvas.hoverCursor = 'grab';
          break;
        case 'text':
          fabricCanvas.defaultCursor = 'text';
          fabricCanvas.hoverCursor = 'text';
          break;
        case 'eraser':
          fabricCanvas.defaultCursor = 'crosshair';
          fabricCanvas.hoverCursor = 'pointer';
          break;
        case 'rectangle':
        case 'circle':
        case 'line':
        case 'arrow':
          fabricCanvas.defaultCursor = 'crosshair';
          fabricCanvas.hoverCursor = 'crosshair';
          break;
        default:
          fabricCanvas.defaultCursor = 'crosshair';
          fabricCanvas.hoverCursor = 'crosshair';
      }

      // Deselect all when changing tools (except select)
      if (currentTool !== 'select') {
        fabricCanvas.discardActiveObject();
      }

      fabricCanvas.renderAll();
    });
  }, [currentTool, strokeColor, strokeWidth]);

  // Render a single page
  const renderPage = useCallback(async (pageNum: number, pdfDoc: pdfjs.PDFDocumentProxy) => {
    console.log(`[PDFEditor] Rendering page ${pageNum}`);
    
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoom * PDF_BASE_SCALE });

    // Create page wrapper
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page-wrapper';
    pageWrapper.style.cssText = `
      position: relative;
      margin: 20px auto;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      background: white;
    `;

    // Create PDF canvas (background)
    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    pdfCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
      pointer-events: none;
    `;

    // Create fabric canvas element (overlay)
    const fabricCanvasEl = document.createElement('canvas');
    fabricCanvasEl.id = `fabric-canvas-${pageNum}`;
    fabricCanvasEl.width = viewport.width;
    fabricCanvasEl.height = viewport.height;

    // Append to wrapper
    pageWrapper.appendChild(pdfCanvas);
    pageWrapper.appendChild(fabricCanvasEl);

    // Append wrapper to container
    if (pagesContainerRef.current) {
      pagesContainerRef.current.appendChild(pageWrapper);
    }

    // Render PDF to canvas
    const ctx = pdfCanvas.getContext('2d');
    if (ctx) {
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;
    }

    // Initialize fabric canvas
    const fabricCanvas = new fabric.Canvas(fabricCanvasEl, {
      width: viewport.width,
      height: viewport.height,
      selection: true,
      preserveObjectStacking: true,
    });

    // Style the fabric canvas wrapper for proper positioning
    const upperCanvas = fabricCanvas.upperCanvasEl;
    const lowerCanvas = fabricCanvas.lowerCanvasEl;
    const wrapper = fabricCanvas.wrapperEl;

    if (wrapper) {
      wrapper.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: ${viewport.width}px !important;
        height: ${viewport.height}px !important;
      `;
    }

    if (upperCanvas) {
      upperCanvas.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: ${viewport.width}px !important;
        height: ${viewport.height}px !important;
        pointer-events: auto !important;
      `;
    }

    if (lowerCanvas) {
      lowerCanvas.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: ${viewport.width}px !important;
        height: ${viewport.height}px !important;
      `;
    }

    // Store page canvas info
    const pageCanvas: PageCanvas = {
      pageNum,
      fabricCanvas,
      scale: zoom * PDF_BASE_SCALE,
      originalWidth: page.getViewport({ scale: 1 }).width,
      originalHeight: page.getViewport({ scale: 1 }).height,
    };
    pageCanvasesRef.current.push(pageCanvas);

    // Set up events
    setupCanvasEvents(fabricCanvas, pageNum);
    
    console.log(`[PDFEditor] Page ${pageNum} rendered and events set up`);
  }, [zoom, setupCanvasEvents]);

  // Load PDF
  const loadPDF = useCallback(async () => {
    if (!pdfUrl) {
      setError('No PDF URL provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('[PDFEditor] Loading PDF from:', pdfUrl);

      // Fetch PDF bytes
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      pdfBytesRef.current = pdfBytes;
      console.log('[PDFEditor] PDF bytes loaded:', pdfBytes.length);

      // Load with PDF.js
      const loadingTask = pdfjs.getDocument({ data: pdfBytes });
      const pdfDoc = await loadingTask.promise;
      pdfDocRef.current = pdfDoc;
      setTotalPages(pdfDoc.numPages);
      console.log('[PDFEditor] PDF loaded, pages:', pdfDoc.numPages);

      // Load with pdf-lib for saving (lazy load, will be done on first save)
      try {
        const pdfLibDoc = await PDFDocument.load(pdfBytes);
        pdfLibDocRef.current = pdfLibDoc;
      } catch (pdfLibErr) {
        console.warn('[PDFEditor] Warning: pdf-lib failed to load PDF, will retry on save:', pdfLibErr);
        // Continue anyway - we can still display and annotate, just save might fail initially
      }

      // Clear existing canvases
      pageCanvasesRef.current.forEach(pc => pc.fabricCanvas.dispose());
      pageCanvasesRef.current = [];

      // Clear container
      if (pagesContainerRef.current) {
        pagesContainerRef.current.innerHTML = '';
      }

      // Clear history
      historyRef.current = [];
      historyIndexRef.current = -1;
      setCanUndo(false);
      setCanRedo(false);

      // Render each page
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        await renderPage(pageNum, pdfDoc);
      }

      setLoading(false);
      console.log('[PDFEditor] All pages rendered');
    } catch (err) {
      console.error('[PDFEditor] Error loading PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
      setLoading(false);
    }
  }, [pdfUrl, renderPage]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;

    historyIndexRef.current--;
    const state = historyRef.current[historyIndexRef.current];
    
    const pageCanvas = pageCanvasesRef.current.find(pc => pc.pageNum === state.pageNum);
    if (pageCanvas) {
      pageCanvas.fabricCanvas.loadFromJSON(JSON.parse(state.json), () => {
        pageCanvas.fabricCanvas.renderAll();
      });
    }
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;

    historyIndexRef.current++;
    const state = historyRef.current[historyIndexRef.current];
    
    const pageCanvas = pageCanvasesRef.current.find(pc => pc.pageNum === state.pageNum);
    if (pageCanvas) {
      pageCanvas.fabricCanvas.loadFromJSON(JSON.parse(state.json), () => {
        pageCanvas.fabricCanvas.renderAll();
      });
    }
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Delete selected objects
  const handleDelete = useCallback(() => {
    pageCanvasesRef.current.forEach(({ fabricCanvas }) => {
      const activeObjects = fabricCanvas.getActiveObjects();
      if (activeObjects.length > 0) {
        activeObjects.forEach(obj => fabricCanvas.remove(obj));
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        saveToHistory(fabricCanvas);
      }
    });
  }, [saveToHistory]);

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      // Add image to the first page
      const firstPageCanvas = pageCanvasesRef.current[0];
      if (firstPageCanvas) {
        fabric.Image.fromURL(dataUrl).then((img) => {
          // Scale image to fit within page
          const maxWidth = firstPageCanvas.fabricCanvas.width! * 0.5;
          const maxHeight = firstPageCanvas.fabricCanvas.height! * 0.5;
          
          const scale = Math.min(
            maxWidth / (img.width || 1),
            maxHeight / (img.height || 1)
          );
          
          img.scale(scale);
          img.set({
            left: 50,
            top: 50,
            selectable: true,
          });
          
          firstPageCanvas.fabricCanvas.add(img);
          firstPageCanvas.fabricCanvas.setActiveObject(img);
          firstPageCanvas.fabricCanvas.renderAll();
          saveToHistory(firstPageCanvas.fabricCanvas);
        });
      }
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [saveToHistory]);

  // Save PDF with annotations
  const handleSave = useCallback(async () => {
    if (!pdfBytesRef.current) {
      console.error('[PDFEditor] No PDF document to save');
      return;
    }

    try {
      setSaving(true);
      console.log('[PDFEditor] Saving PDF with annotations...');

      // Load/reload pdf-lib document if not already loaded
      let pdfDoc = pdfLibDocRef.current;
      if (!pdfDoc) {
        console.log('[PDFEditor] Loading pdf-lib for the first time...');
        try {
          pdfDoc = await PDFDocument.load(pdfBytesRef.current);
          pdfLibDocRef.current = pdfDoc;
        } catch (pdfLibErr) {
          console.error('[PDFEditor] Failed to load PDF with pdf-lib:', pdfLibErr);
          setSaving(false);
          setError('Failed to save PDF - PDF format may not be supported');
          return;
        }
      }
      
      const pages = pdfDoc.getPages();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Process each page canvas
      for (const pageCanvas of pageCanvasesRef.current) {
        const { pageNum, fabricCanvas, scale, originalHeight } = pageCanvas;
        const page = pages[pageNum - 1];
        if (!page) continue;

        const objects = fabricCanvas.getObjects();
        console.log(`[PDFEditor] Page ${pageNum}: ${objects.length} objects to save`);

        for (const obj of objects) {
          const scaleRatio = 1 / scale;
          
          if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
            const textObj = obj as fabric.IText;
            const text = textObj.text || '';
            const x = (textObj.left || 0) * scaleRatio;
            const y = originalHeight - ((textObj.top || 0) * scaleRatio) - ((textObj.fontSize || 16) * scaleRatio);
            
            const color = textObj.fill as string || '#000000';
            let r = 0, g = 0, b = 0;
            if (color.startsWith('#') && color.length >= 7) {
              r = parseInt(color.slice(1, 3), 16) / 255;
              g = parseInt(color.slice(3, 5), 16) / 255;
              b = parseInt(color.slice(5, 7), 16) / 255;
            }

            page.drawText(text, {
              x,
              y,
              size: (textObj.fontSize || 16) * scaleRatio,
              font: textObj.fontWeight === 'bold' ? helveticaBold : helvetica,
              color: rgb(r, g, b),
            });
          } else if (obj.type === 'rect') {
            const rect = obj as fabric.Rect;
            const x = (rect.left || 0) * scaleRatio;
            const y = originalHeight - ((rect.top || 0) * scaleRatio) - ((rect.height || 0) * scaleRatio);
            const width = (rect.width || 0) * scaleRatio;
            const height = (rect.height || 0) * scaleRatio;
            
            const strokeColor = rect.stroke as string || '#000000';
            let sr = 0, sg = 0, sb = 0;
            if (strokeColor.startsWith('#') && strokeColor.length >= 7) {
              sr = parseInt(strokeColor.slice(1, 3), 16) / 255;
              sg = parseInt(strokeColor.slice(3, 5), 16) / 255;
              sb = parseInt(strokeColor.slice(5, 7), 16) / 255;
            }

            page.drawRectangle({
              x,
              y,
              width,
              height,
              borderColor: rgb(sr, sg, sb),
              borderWidth: (rect.strokeWidth || 1) * scaleRatio,
            });
          } else if (obj.type === 'ellipse') {
            const ellipse = obj as fabric.Ellipse;
            const cx = ((ellipse.left || 0) + (ellipse.rx || 0)) * scaleRatio;
            const cy = originalHeight - (((ellipse.top || 0) + (ellipse.ry || 0)) * scaleRatio);
            
            const strokeColor = ellipse.stroke as string || '#000000';
            let sr = 0, sg = 0, sb = 0;
            if (strokeColor.startsWith('#') && strokeColor.length >= 7) {
              sr = parseInt(strokeColor.slice(1, 3), 16) / 255;
              sg = parseInt(strokeColor.slice(3, 5), 16) / 255;
              sb = parseInt(strokeColor.slice(5, 7), 16) / 255;
            }

            page.drawEllipse({
              x: cx,
              y: cy,
              xScale: (ellipse.rx || 0) * scaleRatio,
              yScale: (ellipse.ry || 0) * scaleRatio,
              borderColor: rgb(sr, sg, sb),
              borderWidth: (ellipse.strokeWidth || 1) * scaleRatio,
            });
          } else if (obj.type === 'line') {
            const line = obj as fabric.Line;
            const x1 = (line.x1 || 0) * scaleRatio;
            const y1 = originalHeight - ((line.y1 || 0) * scaleRatio);
            const x2 = (line.x2 || 0) * scaleRatio;
            const y2 = originalHeight - ((line.y2 || 0) * scaleRatio);
            
            const strokeColor = line.stroke as string || '#000000';
            let sr = 0, sg = 0, sb = 0;
            if (strokeColor.startsWith('#') && strokeColor.length >= 7) {
              sr = parseInt(strokeColor.slice(1, 3), 16) / 255;
              sg = parseInt(strokeColor.slice(3, 5), 16) / 255;
              sb = parseInt(strokeColor.slice(5, 7), 16) / 255;
            }

            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              color: rgb(sr, sg, sb),
              thickness: (line.strokeWidth || 1) * scaleRatio,
            });
          } else if (obj.type === 'triangle') {
            // Arrow heads
            const triangle = obj as fabric.Triangle;
            const cx = (triangle.left || 0) * scaleRatio;
            const cy = originalHeight - ((triangle.top || 0) * scaleRatio);
            
            const fillColor = triangle.fill as string || '#000000';
            let fr = 0, fg = 0, fb = 0;
            if (fillColor.startsWith('#') && fillColor.length >= 7) {
              fr = parseInt(fillColor.slice(1, 3), 16) / 255;
              fg = parseInt(fillColor.slice(3, 5), 16) / 255;
              fb = parseInt(fillColor.slice(5, 7), 16) / 255;
            }

            // Draw as a small filled circle for now (triangles in pdf-lib are complex)
            page.drawCircle({
              x: cx,
              y: cy,
              size: 5 * scaleRatio,
              color: rgb(fr, fg, fb),
            });
          } else if (obj.type === 'path') {
            // Handle free drawing paths
            const path = obj as fabric.Path;
            const pathData = path.path;
            if (!pathData || pathData.length < 2) continue;

            const strokeColor = path.stroke as string || '#000000';
            let sr = 0, sg = 0, sb = 0;
            if (strokeColor.startsWith('#') && strokeColor.length >= 7) {
              sr = parseInt(strokeColor.slice(1, 3), 16) / 255;
              sg = parseInt(strokeColor.slice(3, 5), 16) / 255;
              sb = parseInt(strokeColor.slice(5, 7), 16) / 255;
            }

            // Draw path as series of lines
            let lastX = 0, lastY = 0;
            for (let i = 0; i < pathData.length; i++) {
              const cmd = pathData[i];
              
              if (cmd[0] === 'M') {
                lastX = ((cmd[1] as number) + (path.left || 0)) * scaleRatio;
                lastY = originalHeight - (((cmd[2] as number) + (path.top || 0)) * scaleRatio);
              } else if (cmd[0] === 'L' || cmd[0] === 'Q') {
                const x2 = ((cmd[1] as number) + (path.left || 0)) * scaleRatio;
                const y2 = originalHeight - (((cmd[2] as number) + (path.top || 0)) * scaleRatio);
                
                page.drawLine({
                  start: { x: lastX, y: lastY },
                  end: { x: x2, y: y2 },
                  color: rgb(sr, sg, sb),
                  thickness: (path.strokeWidth || 1) * scaleRatio,
                });
                
                lastX = x2;
                lastY = y2;
              }
            }
          }
        }
      }

      // Save PDF
      const savedPdfBytes = await pdfDoc.save();
      console.log('[PDFEditor] PDF saved, bytes:', savedPdfBytes.length);
      
      // Update the stored bytes
      pdfBytesRef.current = savedPdfBytes;
      pdfLibDocRef.current = pdfDoc;

      if (onSave) {
        onSave(savedPdfBytes);
      }

      setSaving(false);
    } catch (err) {
      console.error('[PDFEditor] Error saving PDF:', err);
      setSaving(false);
    }
  }, [onSave]);

  // Download PDF
  const handleDownload = useCallback(async () => {
    try {
      setSaving(true);
      
      if (!pdfBytesRef.current) {
        console.error('[PDFEditor] No PDF to download');
        setSaving(false);
        return;
      }

      // First save with annotations
      await handleSave();
      
      // Then download
      if (pdfBytesRef.current) {
        const blob = new Blob([pdfBytesRef.current], { type: 'application/pdf' });
        saveAs(blob, 'edited-document.pdf');
      }
      
      setSaving(false);
    } catch (err) {
      console.error('[PDFEditor] Error downloading PDF:', err);
      setSaving(false);
    }
  }, [handleSave]);

  // Convert PDF to DOCX for editing
  const handleConvertToDocx = useCallback(async () => {
    if (!pdfUrl) {
      console.error('[PDFEditor] No PDF URL to convert');
      return;
    }

    try {
      setConvertingToDocx(true);
      console.log('[PDFEditor] Converting PDF to DOCX...');

      // Call backend API to convert PDF to DOCX
      const response = await fetch('/api/editor/pdf-to-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storage_url: pdfUrl,
          filename: documentName || 'document.docx',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to convert PDF to DOCX');
      }

      // Get the DOCX blob
      const docxBlob = await response.blob();
      
      // Create URL for the DOCX
      const docxUrl = URL.createObjectURL(docxBlob);
      
      // Open in Word editor by sending message to parent
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'OPEN_DOCX_EDITOR',
          data: {
            docxUrl,
            originalPdfUrl: pdfUrl,
            documentName: documentName?.replace('.pdf', '.docx') || 'document.docx',
          }
        }, '*');
      } else {
        // Direct download if not in iframe
        saveAs(docxBlob, documentName?.replace('.pdf', '.docx') || 'document.docx');
      }

      setConvertingToDocx(false);
    } catch (err) {
      console.error('[PDFEditor] Error converting to DOCX:', err);
      setError(err instanceof Error ? err.message : 'Failed to convert PDF to DOCX');
      setConvertingToDocx(false);
    }
  }, [pdfUrl, documentName]);

  // Download as DOCX (convert and download)
  const handleDownloadAsDocx = useCallback(async () => {
    if (!pdfUrl) return;

    try {
      setConvertingToDocx(true);
      
      const response = await fetch('/api/editor/pdf-to-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storage_url: pdfUrl,
          filename: documentName || 'document.docx',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to convert PDF to DOCX');
      }

      const docxBlob = await response.blob();
      saveAs(docxBlob, documentName?.replace('.pdf', '.docx') || 'document.docx');
      
      setConvertingToDocx(false);
    } catch (err) {
      console.error('[PDFEditor] Error downloading as DOCX:', err);
      setConvertingToDocx(false);
    }
  }, [pdfUrl, documentName]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  // Listen for messages from parent window to receive PDF URL
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const { type, data } = event.data;
      // Listen for both LOAD_DOCUMENT and LOAD_PDF messages
      if ((type === 'LOAD_DOCUMENT' || type === 'LOAD_PDF') && data?.pdfUrl) {
        console.log('[PDFEditor] Received PDF URL from parent:', data.pdfUrl);
        setPdfUrl(data.pdfUrl);
      }
    };

    window.addEventListener('message', handleMessage);

    // Notify parent that PDF editor is ready
    console.log('[PDFEditor] Mounted, sending EDITOR_READY');
    if (window.opener) {
      window.opener.postMessage({ type: 'EDITOR_READY' }, window.location.origin);
    } else if (window.parent !== window) {
      window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Load PDF by documentId if no URL is provided
  useEffect(() => {
    const loadPdfByDocumentId = async () => {
      if (!pdfUrl && documentId) {
        try {
          console.log('[PDFEditor] Loading PDF by documentId:', documentId);
          const { supabase } = await import('@/integrations/supabase/client');
          
          const { data: doc, error: docError } = await supabase
            .from('documents')
            .select('storage_path, original_url')
            .eq('id', documentId)
            .single();

          if (docError || !doc) {
            console.error('[PDFEditor] Could not fetch document:', docError);
            setError('Document not found');
            setLoading(false);
            return;
          }

          let url: string | null = null;
          if (doc.storage_path) {
            const { data: signedData, error: signError } = await supabase
              .storage
              .from('documents')
              .createSignedUrl(doc.storage_path, 3600);

            if (!signError && signedData?.signedUrl) {
              url = signedData.signedUrl;
            }
          }

          if (!url && doc.original_url) {
            url = doc.original_url;
          }

          if (url) {
            console.log('[PDFEditor] Got PDF URL:', url);
            setPdfUrl(url);
          } else {
            setError('Could not get PDF URL');
            setLoading(false);
          }
        } catch (e) {
          console.error('[PDFEditor] Error loading PDF by documentId:', e);
          setError('Failed to load document');
          setLoading(false);
        }
      }
    };

    loadPdfByDocumentId();
  }, [documentId, pdfUrl]);

  // Load PDF on mount or URL change
  useEffect(() => {
    if (pdfUrl) {
      loadPDF();
    }
    
    // Cleanup on unmount
    return () => {
      pageCanvasesRef.current.forEach(pc => pc.fabricCanvas.dispose());
      pageCanvasesRef.current = [];
    };
  }, [pdfUrl]); // Only reload on URL change, not on loadPDF change

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            break;
          case 'y':
            e.preventDefault();
            handleRedo();
            break;
          case 's':
            e.preventDefault();
            handleSave();
            break;
        }
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete if not editing text
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          // Check if any text is being edited
          const isEditingText = pageCanvasesRef.current.some(({ fabricCanvas }) => {
            const activeObj = fabricCanvas.getActiveObject();
            return activeObj && (activeObj as fabric.IText).isEditing;
          });
          
          if (!isEditingText) {
            handleDelete();
          }
        }
      }
      
      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setCurrentTool('select');
            break;
          case 't':
            setCurrentTool('text');
            break;
          case 'd':
            setCurrentTool('draw');
            break;
          case 'h':
            setCurrentTool('highlight');
            break;
          case 'r':
            setCurrentTool('rectangle');
            break;
          case 'c':
            setCurrentTool('circle');
            break;
          case 'l':
            setCurrentTool('line');
            break;
          case 'a':
            setCurrentTool('arrow');
            break;
          case 'e':
            setCurrentTool('eraser');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSave, handleDelete]);

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-gray-100" style={{ minHeight: 0, maxHeight: '100vh' }}>
      {/* Toolbar */}
      <PDFToolbar
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        fontSize={fontSize}
        setFontSize={setFontSize}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        isBold={isBold}
        setIsBold={setIsBold}
        isItalic={isItalic}
        setIsItalic={setIsItalic}
        isUnderline={isUnderline}
        setIsUnderline={setIsUnderline}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDelete={handleDelete}
        onSave={handleSave}
        onDownload={handleDownload}
        onDownloadDocx={() => setShowSaveDialog(true)}
        onImageUpload={() => fileInputRef.current?.click()}
        totalPages={totalPages}
        saving={saving}
        convertingToDocx={convertingToDocx}
        readOnly={readOnly}
        showColorPicker={showColorPicker}
        setShowColorPicker={setShowColorPicker}
      />
      
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Save Format Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Document As</DialogTitle>
            <DialogDescription>
              Choose how you want to save this document
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              variant="outline"
              className="justify-start h-auto p-4"
              onClick={() => {
                setShowSaveDialog(false);
                handleDownload();
              }}
            >
              <Download className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Download as PDF</div>
                <div className="text-sm text-gray-500">Keep the original format with annotations</div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              className="justify-start h-auto p-4"
              onClick={() => {
                setShowSaveDialog(false);
                handleDownloadAsDocx();
              }}
              disabled={convertingToDocx}
            >
              <FileText className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Download as DOCX</div>
                <div className="text-sm text-gray-500">Convert to Word format for easy editing</div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              className="justify-start h-auto p-4"
              onClick={() => {
                setShowSaveDialog(false);
                handleConvertToDocx();
              }}
              disabled={convertingToDocx}
            >
              <FileText className="h-5 w-5 mr-3 text-blue-500" />
              <div className="text-left">
                <div className="font-medium">Edit as DOCX</div>
                <div className="text-sm text-gray-500">Open in Word editor for full text editing</div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Content Area */}
      <div className="flex-1 overflow-auto p-4" style={{ minHeight: 0 }}>
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-gray-500">Loading PDF...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4 text-red-500">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" onClick={loadPDF}>
                Retry
              </Button>
            </div>
          </div>
        )}

        <div
          ref={pagesContainerRef}
          className="pdf-pages-container"
          style={{
            display: loading || error ? 'none' : 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: '100px',
          }}
        />
      </div>
    </div>
  );
};

export default PDFEditor;
