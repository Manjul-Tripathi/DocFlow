import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as fabric from 'fabric';
import { saveAs } from 'file-saver';
import { Button } from '../ui/button';
import {
    Save,
    Download,
    Type,
    Image as ImageIcon,
    Square,
    Circle,
    Pencil,
    Eraser,
    ZoomIn,
    ZoomOut,
    Undo,
    Redo,
    Trash2,
    Highlighter,
    Minus,
    ArrowRight,
    MousePointer2,
    PaintBucket,
    Palette,
    Bold,
    Italic,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

interface PDFEditorProps {
    documentId?: string;
    documentName?: string;
}

type Tool = 'select' | 'text' | 'draw' | 'highlight' | 'rectangle' | 'circle' | 'line' | 'arrow' | 'eraser' | 'image' | 'pan';

interface PageCanvas {
    pageNum: number;
    canvas: fabric.Canvas;
    scale: number;
    originalWidth: number;
    originalHeight: number;
}

interface HistoryState {
    pageNum: number;
    state: string;
}

export const PDFEditor: React.FC<PDFEditorProps> = ({ documentId, documentName }) => {
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pdfLibDoc, setPdfLibDoc] = useState<PDFDocument | null>(null);
    const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [activeTool, setActiveTool] = useState<Tool>('select');
    const [scale, setScale] = useState<number>(1.0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Page canvases
    const [pageCanvases, setPageCanvases] = useState<PageCanvas[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const pagesContainerRef = useRef<HTMLDivElement>(null);
    const isRenderingRef = useRef(false);

    // Drawing settings
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [fillColor, setFillColor] = useState('transparent');
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [fontSize, setFontSize] = useState(16);
    const [fontFamily, setFontFamily] = useState('Arial');
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [highlightColor, setHighlightColor] = useState('rgba(255, 255, 0, 0.4)');

    // History for undo/redo
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoRedoRef = useRef(false);

    // Selected object
    const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);

    // Track active tool ref for event handlers
    const activeToolRef = useRef(activeTool);
    useEffect(() => {
        activeToolRef.current = activeTool;
    }, [activeTool]);

    // Listen for messages from parent window
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            const { type, data } = event.data;
            if (type === 'LOAD_DOCUMENT' && data?.pdfUrl) {
                console.log('Received PDF URL:', data.pdfUrl);
                await loadPDF(data.pdfUrl);
            }
        };

        window.addEventListener('message', handleMessage);

        // Notify parent that PDF editor is ready
        console.log('PDFEditor mounted, sending EDITOR_READY');
        if (window.opener) {
            window.opener.postMessage({ type: 'EDITOR_READY' }, window.location.origin);
        } else if (window.parent !== window) {
            window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
        }

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Load PDF
    const loadPDF = async (url: string) => {
        setIsLoading(true);
        setError(null);
        try {
            console.log('Fetching PDF from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                throw new Error('PDF file is empty');
            }

            const bytes = new Uint8Array(arrayBuffer);
            console.log('PDF bytes received, size:', bytes.length);
            setPdfBytes(bytes);

            // Load with pdfjs for rendering
            try {
                console.log('Loading PDF with pdfjs...');
                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                loadingTask.onProgress = (progress) => {
                    console.log('PDF loading progress:', progress);
                };
                const pdf = await loadingTask.promise;
                console.log('PDF loaded with pdfjs, pages:', pdf.numPages);
                setPdfDoc(pdf);
                setNumPages(pdf.numPages);
            } catch (pdfError: any) {
                console.error('Error loading with pdfjs:', pdfError);
                throw new Error(`Failed to parse PDF: ${pdfError.message}`);
            }

            // Load with pdf-lib for editing/saving
            try {
                console.log('Loading PDF with pdf-lib...');
                const pdfLibDocument = await PDFDocument.load(bytes);
                setPdfLibDoc(pdfLibDocument);
                console.log('PDF loaded with pdf-lib successfully');
            } catch (libError: any) {
                console.error('Error loading with pdf-lib:', libError);
                // Don't throw here - pdfjs loaded successfully which is what matters for rendering
            }

            console.log('PDF fully loaded successfully');
        } catch (error: any) {
            console.error('Error loading PDF:', error);
            setError(error.message || 'Failed to load PDF');
        } finally {
            setIsLoading(false);
        }
    };

    // Save to history for undo/redo
    const saveToHistory = (canvas: fabric.Canvas, pageNum: number) => {
        if (isUndoRedoRef.current) return;

        const state = JSON.stringify(canvas.toJSON());
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push({ pageNum, state });
            return newHistory;
        });
        setHistoryIndex(prev => prev + 1);
    };

    // Setup canvas events
    const setupCanvasEvents = (canvas: fabric.Canvas, pageNum: number) => {
        // Make sure canvas is properly rendered
        canvas.renderAll();
        
        console.log(`Setting up events for canvas page ${pageNum}`);

        canvas.on('selection:created', (e) => {
            console.log('Selection created on page', pageNum);
            setSelectedObject(e.selected?.[0] || null);
        });

        canvas.on('selection:updated', (e) => {
            console.log('Selection updated on page', pageNum);
            setSelectedObject(e.selected?.[0] || null);
        });

        canvas.on('selection:cleared', () => {
            console.log('Selection cleared on page', pageNum);
            setSelectedObject(null);
        });

        canvas.on('object:modified', () => {
            console.log('Object modified on page', pageNum);
            saveToHistory(canvas, pageNum);
        });

        canvas.on('object:added', (e) => {
            console.log('Object added on page', pageNum, e.target?.type);
        });

        canvas.on('path:created', () => {
            console.log('Path created on page', pageNum);
            saveToHistory(canvas, pageNum);
        });

        // Mouse down for text tool and drawing - CRITICAL for text placement
        canvas.on('mouse:down', (opt) => {
            const tool = activeToolRef.current;
            console.log(`Mouse down on page ${pageNum}, tool: ${tool}, target:`, opt.target?.type || 'none');
            
            if (tool === 'text' && !opt.target) {
                const pointer = canvas.getPointer(opt.e);
                console.log(`Adding text at pointer: ${pointer.x}, ${pointer.y}`);
                addTextAtPosition(canvas, pointer.x, pointer.y, pageNum);
            }
        });

        // Test: log mouse move to verify canvas is receiving events
        let lastLogTime = 0;
        canvas.on('mouse:move', () => {
            const now = Date.now();
            if (now - lastLogTime > 1000) { // Log once per second max
                console.log(`Mouse moving over canvas page ${pageNum}`);
                lastLogTime = now;
            }
            
            // Update cursor based on tool
            const cursorMap: { [key in Tool]: string } = {
                'select': 'default',
                'text': 'text',
                'draw': 'crosshair',
                'highlight': 'crosshair',
                'rectangle': 'crosshair',
                'circle': 'crosshair',
                'line': 'crosshair',
                'arrow': 'crosshair',
                'eraser': 'cell',
                'image': 'pointer',
                'pan': 'grab',
            };
            const cursor = cursorMap[activeToolRef.current] || 'default';
            if (canvas.upperCanvasEl) {
                canvas.upperCanvasEl.style.cursor = cursor;
            }
        });
        
        console.log(`Events set up successfully for page ${pageNum}`);
    };

    // Render all pages when PDF is loaded
    useEffect(() => {
        if (!pdfDoc || !pagesContainerRef.current || isRenderingRef.current) return;

        const renderAllPages = async () => {
            isRenderingRef.current = true;
            setError(null); // Clear any previous errors

            try {
                // Dispose previous canvases
                pageCanvases.forEach(pc => {
                    try {
                        pc.canvas.dispose();
                    } catch (e) {
                        console.warn('Error disposing canvas:', e);
                    }
                });
                setPageCanvases([]);

                const container = pagesContainerRef.current!;
                container.innerHTML = '';

                const newPageCanvases: PageCanvas[] = [];

                for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                    try {
                        const page = await pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale });

                        // Create wrapper div
                        const pageWrapper = document.createElement('div');
                        pageWrapper.className = 'pdf-page-wrapper relative mb-6 shadow-xl bg-white mx-auto';
                        pageWrapper.style.width = `${viewport.width}px`;
                        pageWrapper.style.height = `${viewport.height}px`;
                        pageWrapper.style.position = 'relative';
                        pageWrapper.dataset.page = pageNum.toString();

                        // Create PDF render canvas (background)
                        const pdfCanvas = document.createElement('canvas');
                        pdfCanvas.className = 'pdf-render-canvas';
                        pdfCanvas.width = viewport.width;
                        pdfCanvas.height = viewport.height;
                        pdfCanvas.style.position = 'absolute';
                        pdfCanvas.style.top = '0';
                        pdfCanvas.style.left = '0';
                        pdfCanvas.style.display = 'block';
                        pdfCanvas.style.pointerEvents = 'none';

                        // Create fabric canvas element (overlay for editing)
                        const fabricCanvasEl = document.createElement('canvas');
                        fabricCanvasEl.id = `fabric-canvas-${pageNum}`;
                        fabricCanvasEl.width = viewport.width;
                        fabricCanvasEl.height = viewport.height;
                        fabricCanvasEl.style.position = 'absolute';
                        fabricCanvasEl.style.top = '0';
                        fabricCanvasEl.style.left = '0';
                        fabricCanvasEl.style.cursor = 'default';
                        fabricCanvasEl.style.zIndex = '10';
                        fabricCanvasEl.style.pointerEvents = 'auto';

                        pageWrapper.appendChild(pdfCanvas);
                        pageWrapper.appendChild(fabricCanvasEl);

                        // Add page number indicator
                        const pageIndicator = document.createElement('div');
                        pageIndicator.className = 'absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded pointer-events-none';
                        pageIndicator.style.zIndex = '20';
                        pageIndicator.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
                        pageWrapper.appendChild(pageIndicator);

                        container.appendChild(pageWrapper);

                        // Render PDF page to canvas
                        const ctx = pdfCanvas.getContext('2d');
                        if (!ctx) throw new Error('Could not get canvas context');

                        console.log(`Rendering page ${pageNum}...`);
                        await page.render({
                            canvasContext: ctx,
                            viewport: viewport,
                        }).promise;

                        console.log(`Page ${pageNum} rendered successfully`);

                        // Initialize fabric canvas
                        const fabricCanvas = new fabric.Canvas(fabricCanvasEl, {
                            width: viewport.width,
                            height: viewport.height,
                            selection: true,
                            preserveObjectStacking: true,
                            backgroundColor: 'transparent',
                        });

                        // Ensure fabric's wrapper and canvas elements can receive events
                        if (fabricCanvas.wrapperEl) {
                            fabricCanvas.wrapperEl.style.position = 'absolute';
                            fabricCanvas.wrapperEl.style.top = '0';
                            fabricCanvas.wrapperEl.style.left = '0';
                            fabricCanvas.wrapperEl.style.pointerEvents = 'auto';
                        }

                        // Make sure lower canvas doesn't block events
                        if (fabricCanvas.lowerCanvasEl) {
                            fabricCanvas.lowerCanvasEl.style.pointerEvents = 'auto';
                        }

                        // Upper canvas should handle events
                        if (fabricCanvas.upperCanvasEl) {
                            fabricCanvas.upperCanvasEl.style.pointerEvents = 'auto';
                        }

                        // Store canvas reference
                        const pageCanvasInfo: PageCanvas = {
                            pageNum,
                            canvas: fabricCanvas,
                            scale,
                            originalWidth: page.getViewport({ scale: 1 }).width,
                            originalHeight: page.getViewport({ scale: 1 }).height,
                        };

                        newPageCanvases.push(pageCanvasInfo);

                        // Set up event listeners for the canvas
                        setupCanvasEvents(fabricCanvas, pageNum);
                        
                        console.log(`Canvas ${pageNum} initialized with events`);
                    } catch (e) {
                        console.error(`Error rendering page ${pageNum}:`, e);
                    }
                }

                setPageCanvases(newPageCanvases);
                console.log(`All ${newPageCanvases.length} pages rendered successfully`);
            } catch (err) {
                console.error('Error rendering PDF pages:', err);
                setError(`Error rendering PDF: ${(err as Error).message}`);
            } finally {
                isRenderingRef.current = false;
            }
        };

        renderAllPages();
    }, [pdfDoc, scale]);

    // Update tool settings on all canvases
    useEffect(() => {
        pageCanvases.forEach(({ canvas }) => {
            updateCanvasTool(canvas);
        });
    }, [activeTool, strokeColor, strokeWidth, highlightColor, pageCanvases]);

    const updateCanvasTool = (canvas: fabric.Canvas) => {
        // Reset all modes
        canvas.isDrawingMode = false;
        canvas.selection = true;

        switch (activeTool) {
            case 'draw':
                canvas.isDrawingMode = true;
                canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
                canvas.freeDrawingBrush.color = strokeColor;
                canvas.freeDrawingBrush.width = strokeWidth;
                break;

            case 'highlight':
                canvas.isDrawingMode = true;
                canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
                canvas.freeDrawingBrush.color = highlightColor;
                canvas.freeDrawingBrush.width = 20;
                break;

            case 'eraser':
                canvas.isDrawingMode = true;
                canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
                canvas.freeDrawingBrush.color = '#FFFFFF';
                canvas.freeDrawingBrush.width = strokeWidth * 3;
                break;

            case 'select':
            case 'text':
            case 'rectangle':
            case 'circle':
            case 'line':
            case 'arrow':
            case 'image':
                canvas.selection = true;
                break;

            case 'pan':
                canvas.selection = false;
                break;
        }
    };

    // Add text at position
    const addTextAtPosition = (canvas: fabric.Canvas, x: number, y: number, pageNum: number) => {
        console.log(`Adding text at (${x}, ${y}) on page ${pageNum}`);
        
        try {
            const text = new fabric.IText('Type here', {
                left: x,
                top: y,
                fontSize: fontSize,
                fontFamily: fontFamily,
                fill: strokeColor,
                fontWeight: isBold ? 'bold' : 'normal',
                fontStyle: isItalic ? 'italic' : 'normal',
                editable: true,
                selectable: true,
            });

            canvas.add(text);
            canvas.setActiveObject(text);
            canvas.renderAll();
            
            // Enter editing mode
            text.enterEditing();
            text.selectAll();
            
            console.log('Text added successfully');
        } catch (error) {
            console.error('Error adding text:', error);
        }
    };

    // Get the canvas that's currently most visible
    const getActiveCanvas = (): PageCanvas | null => {
        if (pageCanvases.length === 0) return null;
        if (pageCanvases.length === 1) return pageCanvases[0];

        const container = containerRef.current;
        if (!container) return pageCanvases[0];

        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.top + containerRect.height / 2;

        let closestCanvas = pageCanvases[0];
        let closestDistance = Infinity;

        document.querySelectorAll('.pdf-page-wrapper').forEach((wrapper) => {
            const rect = wrapper.getBoundingClientRect();
            const pageCenter = rect.top + rect.height / 2;
            const distance = Math.abs(pageCenter - containerCenter);

            const pageNum = parseInt(wrapper.getAttribute('data-page') || '1');
            const canvas = pageCanvases.find(pc => pc.pageNum === pageNum);

            if (canvas && distance < closestDistance) {
                closestDistance = distance;
                closestCanvas = canvas;
            }
        });

        return closestCanvas;
    };

    // Add shape to active canvas
    const addShapeToCanvas = (shapeType: 'rectangle' | 'circle' | 'line' | 'arrow') => {
        const activeCanvas = getActiveCanvas();
        if (!activeCanvas) return;

        const { canvas, pageNum } = activeCanvas;
        const centerX = canvas.getWidth()! / 2;
        const centerY = canvas.getHeight()! / 2;

        let shape: fabric.Object;

        switch (shapeType) {
            case 'rectangle':
                shape = new fabric.Rect({
                    left: centerX - 50,
                    top: centerY - 30,
                    width: 100,
                    height: 60,
                    fill: fillColor === 'transparent' ? '' : fillColor,
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                });
                break;

            case 'circle':
                shape = new fabric.Circle({
                    left: centerX - 40,
                    top: centerY - 40,
                    radius: 40,
                    fill: fillColor === 'transparent' ? '' : fillColor,
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                });
                break;

            case 'line':
                shape = new fabric.Line([centerX - 50, centerY, centerX + 50, centerY], {
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                });
                break;

            case 'arrow':
                // Create arrow group
                const line = new fabric.Line([0, 25, 80, 25], {
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                });
                const triangle = new fabric.Triangle({
                    width: 15,
                    height: 15,
                    fill: strokeColor,
                    left: 80,
                    top: 17,
                    angle: 90,
                });
                shape = new fabric.Group([line, triangle], {
                    left: centerX - 40,
                    top: centerY - 12,
                });
                break;

            default:
                return;
        }

        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.renderAll();
        saveToHistory(canvas, pageNum);
    };

    // Add image
    const handleAddImage = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                const activeCanvas = getActiveCanvas();
                if (!activeCanvas) return;

                fabric.Image.fromURL(dataUrl, (img) => {
                    const maxSize = 300;
                    if (img.width && img.width > maxSize) {
                        img.scaleToWidth(maxSize);
                    }
                    if (img.height && img.height > maxSize) {
                        img.scaleToHeight(maxSize);
                    }

                    img.set({
                        left: 100,
                        top: 100,
                    });

                    activeCanvas.canvas.add(img);
                    activeCanvas.canvas.setActiveObject(img);
                    activeCanvas.canvas.renderAll();
                    saveToHistory(activeCanvas.canvas, activeCanvas.pageNum);
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    // Delete selected object
    const handleDelete = () => {
        pageCanvases.forEach(({ canvas, pageNum }) => {
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                canvas.remove(activeObj);
                canvas.renderAll();
                saveToHistory(canvas, pageNum);
            }
        });
        setSelectedObject(null);
    };

    // Undo
    const handleUndo = () => {
        if (historyIndex <= 0) return;
        isUndoRedoRef.current = true;

        const prevState = history[historyIndex - 1];
        const pageCanvas = pageCanvases.find(pc => pc.pageNum === prevState.pageNum);
        if (pageCanvas) {
            pageCanvas.canvas.loadFromJSON(prevState.state, () => {
                pageCanvas.canvas.renderAll();
                setHistoryIndex(historyIndex - 1);
                isUndoRedoRef.current = false;
            });
        } else {
            isUndoRedoRef.current = false;
        }
    };

    // Redo
    const handleRedo = () => {
        if (historyIndex >= history.length - 1) return;
        isUndoRedoRef.current = true;

        const nextState = history[historyIndex + 1];
        const pageCanvas = pageCanvases.find(pc => pc.pageNum === nextState.pageNum);
        if (pageCanvas) {
            pageCanvas.canvas.loadFromJSON(nextState.state, () => {
                pageCanvas.canvas.renderAll();
                setHistoryIndex(historyIndex + 1);
                isUndoRedoRef.current = false;
            });
        } else {
            isUndoRedoRef.current = false;
        }
    };

    // Parse color string to RGB values
    const parseColor = (color: string): { r: number; g: number; b: number } => {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16) / 255;
            const g = parseInt(color.slice(3, 5), 16) / 255;
            const b = parseInt(color.slice(5, 7), 16) / 255;
            return { r, g, b };
        }
        // Default to black
        return { r: 0, g: 0, b: 0 };
    };

    // Save PDF with annotations
    const handleSave = async () => {
        if (!pdfLibDoc || !pdfBytes || pageCanvases.length === 0) return;

        setIsSaving(true);
        try {
            const freshPdfDoc = await PDFDocument.load(pdfBytes);
            const pages = freshPdfDoc.getPages();
            const helveticaFont = await freshPdfDoc.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await freshPdfDoc.embedFont(StandardFonts.HelveticaBold);

            for (const pageCanvas of pageCanvases) {
                const { canvas, pageNum, originalWidth, originalHeight, scale: canvasScale } = pageCanvas;
                const page = pages[pageNum - 1];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                const objects = canvas.getObjects();
                const scaleX = pageWidth / (originalWidth * canvasScale);
                const scaleY = pageHeight / (originalHeight * canvasScale);

                for (const obj of objects) {
                    try {
                        if (obj.type === 'i-text' || obj.type === 'text') {
                            const textObj = obj as fabric.IText;
                            const x = (textObj.left || 0) * scaleX;
                            const y = pageHeight - ((textObj.top || 0) + (textObj.height || 0) * (textObj.scaleY || 1)) * scaleY;

                            const font = textObj.fontWeight === 'bold' ? helveticaBold : helveticaFont;
                            const textFontSize = ((textObj.fontSize || 16) * (textObj.scaleY || 1)) * scaleY;

                            const { r, g, b } = parseColor(textObj.fill as string || '#000000');

                            page.drawText(textObj.text || '', {
                                x,
                                y,
                                size: textFontSize,
                                font,
                                color: rgb(r, g, b),
                            });
                        } else if (obj.type === 'rect') {
                            const rectObj = obj as fabric.Rect;
                            const x = (rectObj.left || 0) * scaleX;
                            const y = pageHeight - ((rectObj.top || 0) + (rectObj.height || 0) * (rectObj.scaleY || 1)) * scaleY;
                            const w = (rectObj.width || 0) * (rectObj.scaleX || 1) * scaleX;
                            const h = (rectObj.height || 0) * (rectObj.scaleY || 1) * scaleY;

                            const { r, g, b } = parseColor(rectObj.stroke as string || '#000000');

                            page.drawRectangle({
                                x,
                                y,
                                width: w,
                                height: h,
                                borderColor: rgb(r, g, b),
                                borderWidth: rectObj.strokeWidth || 1,
                            });
                        } else if (obj.type === 'circle') {
                            const circleObj = obj as fabric.Circle;
                            const centerX = ((circleObj.left || 0) + (circleObj.radius || 0) * (circleObj.scaleX || 1)) * scaleX;
                            const centerY = pageHeight - ((circleObj.top || 0) + (circleObj.radius || 0) * (circleObj.scaleY || 1)) * scaleY;
                            const radius = (circleObj.radius || 0) * (circleObj.scaleX || 1) * scaleX;

                            const { r, g, b } = parseColor(circleObj.stroke as string || '#000000');

                            page.drawCircle({
                                x: centerX,
                                y: centerY,
                                size: radius,
                                borderColor: rgb(r, g, b),
                                borderWidth: circleObj.strokeWidth || 1,
                            });
                        } else if (obj.type === 'line') {
                            const lineObj = obj as fabric.Line;
                            const x1 = ((lineObj.x1 || 0) + (lineObj.left || 0)) * scaleX;
                            const y1 = pageHeight - ((lineObj.y1 || 0) + (lineObj.top || 0)) * scaleY;
                            const x2 = ((lineObj.x2 || 0) + (lineObj.left || 0)) * scaleX;
                            const y2 = pageHeight - ((lineObj.y2 || 0) + (lineObj.top || 0)) * scaleY;

                            const { r, g, b } = parseColor(lineObj.stroke as string || '#000000');

                            page.drawLine({
                                start: { x: x1, y: y1 },
                                end: { x: x2, y: y2 },
                                thickness: lineObj.strokeWidth || 1,
                                color: rgb(r, g, b),
                            });
                        } else if (obj.type === 'path') {
                            // For freehand drawing - draw as series of lines
                            const pathObj = obj as fabric.Path;
                            const { r, g, b } = parseColor(pathObj.stroke as string || '#000000');
                            const pathData = pathObj.path;
                            
                            if (pathData && Array.isArray(pathData)) {
                                let currentX = 0, currentY = 0;
                                for (const cmd of pathData) {
                                    const cmdType = cmd[0];
                                    if (cmdType === 'M') {
                                        currentX = ((cmd[1] as number) + (pathObj.left || 0)) * scaleX;
                                        currentY = pageHeight - ((cmd[2] as number) + (pathObj.top || 0)) * scaleY;
                                    } else if (cmdType === 'L' || cmdType === 'Q') {
                                        const endX = ((cmd[1] as number) + (pathObj.left || 0)) * scaleX;
                                        const endY = pageHeight - ((cmd[2] as number) + (pathObj.top || 0)) * scaleY;
                                        page.drawLine({
                                            start: { x: currentX, y: currentY },
                                            end: { x: endX, y: endY },
                                            thickness: pathObj.strokeWidth || 1,
                                            color: rgb(r, g, b),
                                        });
                                        currentX = endX;
                                        currentY = endY;
                                    }
                                }
                            }
                        } else if (obj.type === 'image') {
                            const imgObj = obj as fabric.Image;
                            const imgElement = imgObj.getElement() as HTMLImageElement;
                            
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = imgElement.naturalWidth || imgElement.width;
                            tempCanvas.height = imgElement.naturalHeight || imgElement.height;
                            const ctx = tempCanvas.getContext('2d')!;
                            ctx.drawImage(imgElement, 0, 0);
                            const dataUrl = tempCanvas.toDataURL('image/png');
                            const base64Data = dataUrl.split(',')[1];
                            
                            try {
                                const pngImage = await freshPdfDoc.embedPng(Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)));
                                const imgX = (imgObj.left || 0) * scaleX;
                                const imgY = pageHeight - ((imgObj.top || 0) + (imgObj.height || 0) * (imgObj.scaleY || 1)) * scaleY;
                                const imgW = (imgObj.width || 0) * (imgObj.scaleX || 1) * scaleX;
                                const imgH = (imgObj.height || 0) * (imgObj.scaleY || 1) * scaleY;

                                page.drawImage(pngImage, {
                                    x: imgX,
                                    y: imgY,
                                    width: imgW,
                                    height: imgH,
                                });
                            } catch (e) {
                                console.warn('Failed to embed image:', e);
                            }
                        } else if (obj.type === 'group') {
                            // Handle groups (like arrows)
                            const groupObj = obj as fabric.Group;
                            const groupLeft = groupObj.left || 0;
                            const groupTop = groupObj.top || 0;
                            
                            groupObj.getObjects().forEach(child => {
                                if (child.type === 'line') {
                                    const lineObj = child as fabric.Line;
                                    const x1 = ((lineObj.x1 || 0) + groupLeft) * scaleX;
                                    const y1 = pageHeight - ((lineObj.y1 || 0) + groupTop) * scaleY;
                                    const x2 = ((lineObj.x2 || 0) + groupLeft) * scaleX;
                                    const y2 = pageHeight - ((lineObj.y2 || 0) + groupTop) * scaleY;

                                    const { r, g, b } = parseColor(lineObj.stroke as string || strokeColor);

                                    page.drawLine({
                                        start: { x: x1, y: y1 },
                                        end: { x: x2, y: y2 },
                                        thickness: lineObj.strokeWidth || strokeWidth,
                                        color: rgb(r, g, b),
                                    });
                                } else if (child.type === 'triangle') {
                                    // Draw triangle as filled polygon
                                    const triObj = child as fabric.Triangle;
                                    const { r, g, b } = parseColor(triObj.fill as string || strokeColor);
                                    
                                    // Simplified - just draw a small filled rect for arrowhead
                                    const triX = ((triObj.left || 0) + groupLeft) * scaleX;
                                    const triY = pageHeight - ((triObj.top || 0) + groupTop) * scaleY;
                                    
                                    page.drawRectangle({
                                        x: triX,
                                        y: triY - 5,
                                        width: 10,
                                        height: 10,
                                        color: rgb(r, g, b),
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('Error processing object:', obj.type, e);
                    }
                }
            }

            const modifiedPdfBytes = await freshPdfDoc.save();

            // Send to parent for saving
            const message = {
                type: 'REQUEST_SAVE',
                data: {
                    pdfBytes: Array.from(modifiedPdfBytes),
                    documentId,
                    documentName
                }
            };

            if (window.opener) {
                window.opener.postMessage(message, window.location.origin);
            } else if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            }

            alert('PDF saved successfully!');
        } catch (error) {
            console.error('Error saving PDF:', error);
            alert('Failed to save PDF: ' + (error as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    // Download PDF
    const handleDownload = async () => {
        if (!pdfBytes || pageCanvases.length === 0) return;

        setIsSaving(true);
        try {
            const freshPdfDoc = await PDFDocument.load(pdfBytes);
            const pages = freshPdfDoc.getPages();
            const helveticaFont = await freshPdfDoc.embedFont(StandardFonts.Helvetica);

            for (const pageCanvas of pageCanvases) {
                const { canvas, pageNum, originalWidth, originalHeight, scale: canvasScale } = pageCanvas;
                const page = pages[pageNum - 1];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                const objects = canvas.getObjects();
                const scaleX = pageWidth / (originalWidth * canvasScale);
                const scaleY = pageHeight / (originalHeight * canvasScale);

                for (const obj of objects) {
                    if (obj.type === 'i-text' || obj.type === 'text') {
                        const textObj = obj as fabric.IText;
                        const x = (textObj.left || 0) * scaleX;
                        const y = pageHeight - ((textObj.top || 0) + (textObj.height || 0) * (textObj.scaleY || 1)) * scaleY;

                        const { r, g, b } = parseColor(textObj.fill as string || '#000000');

                        page.drawText(textObj.text || '', {
                            x,
                            y,
                            size: ((textObj.fontSize || 16) * (textObj.scaleY || 1)) * scaleY,
                            font: helveticaFont,
                            color: rgb(r, g, b),
                        });
                    }
                    // Similar handling for other objects...
                }
            }

            const modifiedPdfBytes = await freshPdfDoc.save();
            const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
            saveAs(blob, documentName || 'edited-document.pdf');
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Failed to download PDF');
        } finally {
            setIsSaving(false);
        }
    };

    // Zoom controls
    const handleZoom = (delta: number) => {
        setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
    };

    // Bring forward / send backward
    const handleBringForward = () => {
        pageCanvases.forEach(({ canvas }) => {
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                canvas.bringForward(activeObj);
                canvas.renderAll();
            }
        });
    };

    const handleSendBackward = () => {
        pageCanvases.forEach(({ canvas }) => {
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                canvas.sendBackwards(activeObj);
                canvas.renderAll();
            }
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading PDF...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Main Toolbar */}
            <div className="bg-white border-b shadow-sm">
                <div className="p-2 flex items-center gap-2 flex-wrap">
                    {/* Selection & Drawing Tools */}
                    <div className="flex items-center gap-1 border-r pr-2">
                        <Button
                            variant={activeTool === 'select' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTool('select')}
                            title="Select (V)"
                        >
                            <MousePointer2 className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={activeTool === 'text' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTool('text')}
                            title="Text Tool - Click to add text"
                        >
                            <Type className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={activeTool === 'draw' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTool('draw')}
                            title="Freehand Draw"
                        >
                            <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={activeTool === 'highlight' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTool('highlight')}
                            title="Highlighter"
                        >
                            <Highlighter className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={activeTool === 'eraser' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTool('eraser')}
                            title="Eraser"
                        >
                            <Eraser className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Shape Tools */}
                    <div className="flex items-center gap-1 border-r pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addShapeToCanvas('rectangle')}
                            title="Add Rectangle"
                        >
                            <Square className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addShapeToCanvas('circle')}
                            title="Add Circle"
                        >
                            <Circle className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addShapeToCanvas('line')}
                            title="Add Line"
                        >
                            <Minus className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addShapeToCanvas('arrow')}
                            title="Add Arrow"
                        >
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddImage}
                            title="Add Image"
                        >
                            <ImageIcon className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Colors */}
                    <div className="flex items-center gap-2 border-r pr-2">
                        <div className="flex items-center gap-1">
                            <Palette className="w-4 h-4 text-gray-500" />
                            <input
                                type="color"
                                value={strokeColor}
                                onChange={(e) => setStrokeColor(e.target.value)}
                                className="w-8 h-8 cursor-pointer border rounded"
                                title="Stroke Color"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <PaintBucket className="w-4 h-4 text-gray-500" />
                            <input
                                type="color"
                                value={fillColor === 'transparent' ? '#ffffff' : fillColor}
                                onChange={(e) => setFillColor(e.target.value)}
                                className="w-8 h-8 cursor-pointer border rounded"
                                title="Fill Color"
                            />
                            <Button
                                variant={fillColor === 'transparent' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setFillColor('transparent')}
                                title="No Fill"
                                className="text-xs px-2"
                            >
                                ∅
                            </Button>
                        </div>
                    </div>

                    {/* Stroke Width */}
                    <div className="flex items-center gap-1 border-r pr-2">
                        <span className="text-xs text-gray-500">Width:</span>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={strokeWidth}
                            onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                            className="w-16"
                        />
                        <span className="text-xs w-6">{strokeWidth}px</span>
                    </div>

                    {/* Font Settings (for text tool) */}
                    {activeTool === 'text' && (
                        <div className="flex items-center gap-1 border-r pr-2">
                            <select
                                value={fontSize}
                                onChange={(e) => setFontSize(parseInt(e.target.value))}
                                className="text-sm border rounded px-1 py-1"
                            >
                                {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72].map(size => (
                                    <option key={size} value={size}>{size}px</option>
                                ))}
                            </select>
                            <Button
                                variant={isBold ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setIsBold(!isBold)}
                            >
                                <Bold className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={isItalic ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setIsItalic(!isItalic)}
                            >
                                <Italic className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    {/* Undo/Redo */}
                    <div className="flex items-center gap-1 border-r pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUndo}
                            disabled={historyIndex <= 0}
                            title="Undo"
                        >
                            <Undo className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRedo}
                            disabled={historyIndex >= history.length - 1}
                            title="Redo"
                        >
                            <Redo className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Object Actions */}
                    {selectedObject && (
                        <div className="flex items-center gap-1 border-r pr-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleBringForward}
                                title="Bring Forward"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSendBackward}
                                title="Send Backward"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDelete}
                                title="Delete"
                                className="text-red-500 hover:text-red-700"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    {/* Zoom */}
                    <div className="flex items-center gap-1 border-r pr-2">
                        <Button variant="outline" size="sm" onClick={() => handleZoom(-0.25)} title="Zoom Out">
                            <ZoomOut className="w-4 h-4" />
                        </Button>
                        <span className="text-sm px-2 min-w-[50px] text-center">{Math.round(scale * 100)}%</span>
                        <Button variant="outline" size="sm" onClick={() => handleZoom(0.25)} title="Zoom In">
                            <ZoomIn className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Save/Download */}
                    <div className="flex items-center gap-1 ml-auto">
                        <Button 
                            variant="default" 
                            size="sm" 
                            onClick={handleSave}
                            disabled={isSaving || !pdfBytes}
                        >
                            <Save className="w-4 h-4 mr-1" />
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleDownload}
                            disabled={isSaving || !pdfBytes}
                        >
                            <Download className="w-4 h-4 mr-1" />
                            Download
                        </Button>
                    </div>

                    <div className="text-sm text-gray-600 truncate max-w-[200px]">
                        {documentName || 'Untitled PDF'}
                    </div>
                </div>

                {/* Tool hint */}
                {activeTool === 'text' && (
                    <div className="bg-blue-50 text-blue-700 text-sm px-4 py-1 border-t">
                        Click anywhere on the PDF to add text. Double-click text to edit.
                    </div>
                )}
                {activeTool === 'draw' && (
                    <div className="bg-blue-50 text-blue-700 text-sm px-4 py-1 border-t">
                        Click and drag to draw. Use color picker to change brush color.
                    </div>
                )}
                {activeTool === 'highlight' && (
                    <div className="bg-yellow-50 text-yellow-700 text-sm px-4 py-1 border-t">
                        Click and drag to highlight text. The highlighter is semi-transparent.
                    </div>
                )}
            </div>

            {/* PDF Pages Container */}
            <div 
                ref={containerRef}
                className="flex-1 overflow-auto bg-gray-300 p-6"
            >
                {error && !pdfBytes && (
                    <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                        <div className="text-red-500 text-xl mb-2">⚠️ Failed to load PDF</div>
                        <p className="text-gray-700 mb-4">{error}</p>
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            Retry
                        </Button>
                    </div>
                )}

                {error && pdfBytes && (
                    <div className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center z-40 max-w-md">
                        <div className="text-yellow-700 text-sm">⚠️ {error}</div>
                    </div>
                )}

                {!pdfBytes && !isLoading && !error && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                            <div className="text-6xl mb-4">📄</div>
                            <p>No PDF loaded</p>
                            <p className="text-sm mt-2">Waiting for document...</p>
                        </div>
                    </div>
                )}

                {/* Pages will be rendered here */}
                <div 
                    ref={pagesContainerRef}
                    className="flex flex-col items-center gap-4"
                    style={{ 
                        cursor: activeTool === 'text' ? 'crosshair' : 
                               activeTool === 'draw' || activeTool === 'highlight' ? 'crosshair' :
                               activeTool === 'eraser' ? 'cell' : 'default'
                    }}
                >
                    {/* Canvas elements are dynamically inserted here */}
                </div>
            </div>

            {/* Status Bar */}
            <div className="bg-white border-t px-4 py-1 flex items-center justify-between text-sm text-gray-600">
                <div>
                    {numPages > 0 ? `${numPages} pages` : 'No document'}
                </div>
                <div className="flex items-center gap-4">
                    {selectedObject && (
                        <span className="text-blue-600">
                            Selected: {selectedObject.type}
                        </span>
                    )}
                    <span>Zoom: {Math.round(scale * 100)}%</span>
                </div>
            </div>
        </div>
    );
};
