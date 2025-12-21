import { useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import * as pdfjs from 'pdfjs-dist';
import { PageCanvas, ToolType, ToolSettings } from '../types';
import { PDF_BASE_SCALE } from '../constants';

interface UseCanvasManagerProps {
  zoom: number;
  toolSettingsRef: React.MutableRefObject<ToolSettings>;
  currentToolRef: React.MutableRefObject<ToolType>;
  onHistorySave: (canvas: fabric.Canvas) => void;
}

export function useCanvasManager({
  zoom,
  toolSettingsRef,
  currentToolRef,
  onHistorySave,
}: UseCanvasManagerProps) {
  const pageCanvasesRef = useRef<PageCanvas[]>([]);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempShapeRef = useRef<fabric.Object | null>(null);

  // Add text at position
  const addTextAtPosition = useCallback((canvas: fabric.Canvas, x: number, y: number) => {
    console.log('[Canvas] Adding text at position:', x, y);
    const settings = toolSettingsRef.current;
    
    const text = new fabric.IText('Type here...', {
      left: x,
      top: y,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      fill: settings.strokeColor,
      fontWeight: settings.isBold ? 'bold' : 'normal',
      fontStyle: settings.isItalic ? 'italic' : 'normal',
      underline: settings.isUnderline,
      editable: true,
      selectable: true,
      cursorColor: settings.strokeColor,
      cursorWidth: 2,
      editingBorderColor: '#2196F3',
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    
    // Enter editing mode after a short delay to ensure canvas is ready
    setTimeout(() => {
      text.enterEditing();
      text.selectAll();
      canvas.renderAll();
    }, 50);
    
    onHistorySave(canvas);
  }, [toolSettingsRef, onHistorySave]);

  // Set up canvas events
  const setupCanvasEvents = useCallback((canvas: fabric.Canvas, pageNum: number) => {
    console.log(`[Canvas] Setting up events for page ${pageNum}`);

    // Mouse down handler
    canvas.on('mouse:down', (opt) => {
      const pointer = canvas.getPointer(opt.e);
      const tool = currentToolRef.current;
      const settings = toolSettingsRef.current;
      
      console.log(`[Canvas] Mouse down - tool: ${tool}, pointer:`, pointer.x, pointer.y);

      // Text tool - add new text
      if (tool === 'text') {
        const target = canvas.findTarget(opt.e);
        if (!target) {
          addTextAtPosition(canvas, pointer.x, pointer.y);
        }
        return;
      }

      // Pan tool
      if (tool === 'pan') {
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
        return;
      }

      // Eraser tool
      if (tool === 'eraser') {
        const target = canvas.findTarget(opt.e);
        if (target) {
          canvas.remove(target);
          canvas.renderAll();
          onHistorySave(canvas);
        }
        return;
      }

      // Shape tools
      if (['rectangle', 'circle', 'line', 'arrow'].includes(tool)) {
        isDrawingRef.current = true;
        drawStartRef.current = { x: pointer.x, y: pointer.y };
        canvas.selection = false;

        let shape: fabric.Object | null = null;
        const fill = settings.fillColor === 'transparent' ? undefined : settings.fillColor;

        switch (tool) {
          case 'rectangle':
            shape = new fabric.Rect({
              left: pointer.x,
              top: pointer.y,
              width: 0,
              height: 0,
              fill: fill,
              stroke: settings.strokeColor,
              strokeWidth: settings.strokeWidth,
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
              stroke: settings.strokeColor,
              strokeWidth: settings.strokeWidth,
              selectable: false,
              evented: false,
            });
            break;
          case 'line':
          case 'arrow':
            shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
              stroke: settings.strokeColor,
              strokeWidth: settings.strokeWidth,
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

    // Mouse move handler
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
          ellipse.set({
            rx: Math.abs(pointer.x - startX) / 2,
            ry: Math.abs(pointer.y - startY) / 2,
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

    // Mouse up handler
    canvas.on('mouse:up', () => {
      const tool = currentToolRef.current;
      const settings = toolSettingsRef.current;
      
      if (isDrawingRef.current && tempShapeRef.current) {
        tempShapeRef.current.set({ 
          selectable: true,
          evented: true,
        });
        
        // Add arrowhead for arrow tool
        if (tool === 'arrow') {
          const line = tempShapeRef.current as fabric.Line;
          const x1 = line.x1 || 0;
          const y1 = line.y1 || 0;
          const x2 = line.x2 || 0;
          const y2 = line.y2 || 0;
          
          if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLength = 15;
            
            const arrowHead = new fabric.Triangle({
              left: x2,
              top: y2,
              width: headLength,
              height: headLength,
              fill: settings.strokeColor,
              angle: (angle * 180 / Math.PI) + 90,
              originX: 'center',
              originY: 'center',
              selectable: true,
            });
            
            canvas.add(arrowHead);
          }
        }
        
        canvas.renderAll();
        onHistorySave(canvas);
      }

      isDrawingRef.current = false;
      drawStartRef.current = null;
      tempShapeRef.current = null;
      canvas.selection = true;
      canvas.defaultCursor = 'default';
    });

    // Object modified
    canvas.on('object:modified', () => {
      onHistorySave(canvas);
    });

    // Path created (for free drawing)
    canvas.on('path:created', () => {
      onHistorySave(canvas);
    });

    // Text editing events
    canvas.on('text:editing:entered', () => {
      console.log('[Canvas] Text editing entered');
    });

    canvas.on('text:editing:exited', () => {
      console.log('[Canvas] Text editing exited');
      onHistorySave(canvas);
    });
  }, [currentToolRef, toolSettingsRef, addTextAtPosition, onHistorySave]);

  // Render a single page
  const renderPage = useCallback(async (
    pageNum: number, 
    pdfDoc: pdfjs.PDFDocumentProxy,
    container: HTMLDivElement
  ): Promise<PageCanvas> => {
    console.log(`[Canvas] Rendering page ${pageNum}`);
    
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
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      background: white;
      border-radius: 4px;
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
    container.appendChild(pageWrapper);

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
      renderOnAddRemove: true,
    });

    // Style the fabric canvas wrapper
    const wrapper = fabricCanvas.wrapperEl;
    const upperCanvas = fabricCanvas.upperCanvasEl;
    const lowerCanvas = fabricCanvas.lowerCanvasEl;

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

    // Set up events
    setupCanvasEvents(fabricCanvas, pageNum);
    
    console.log(`[Canvas] Page ${pageNum} rendered`);
    return pageCanvas;
  }, [zoom, setupCanvasEvents]);

  // Update canvas settings based on current tool
  const updateCanvasSettings = useCallback((currentTool: ToolType, settings: ToolSettings) => {
    pageCanvasesRef.current.forEach(({ fabricCanvas }) => {
      // Update drawing mode
      if (currentTool === 'draw') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        if (fabricCanvas.freeDrawingBrush) {
          fabricCanvas.freeDrawingBrush.color = settings.strokeColor;
          fabricCanvas.freeDrawingBrush.width = settings.strokeWidth;
        }
      } else if (currentTool === 'highlight') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        if (fabricCanvas.freeDrawingBrush) {
          fabricCanvas.freeDrawingBrush.color = settings.strokeColor + '66';
          fabricCanvas.freeDrawingBrush.width = 20;
        }
      } else {
        fabricCanvas.isDrawingMode = false;
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
        default:
          fabricCanvas.defaultCursor = 'crosshair';
          fabricCanvas.hoverCursor = 'crosshair';
      }

      if (currentTool !== 'select' && currentTool !== 'text') {
        fabricCanvas.discardActiveObject();
      }

      fabricCanvas.renderAll();
    });
  }, []);

  // Delete selected objects
  const deleteSelected = useCallback(() => {
    pageCanvasesRef.current.forEach(({ fabricCanvas }) => {
      const activeObjects = fabricCanvas.getActiveObjects();
      if (activeObjects.length > 0) {
        activeObjects.forEach(obj => fabricCanvas.remove(obj));
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        onHistorySave(fabricCanvas);
      }
    });
  }, [onHistorySave]);

  // Clear all canvases
  const clearCanvases = useCallback(() => {
    pageCanvasesRef.current.forEach(pc => pc.fabricCanvas.dispose());
    pageCanvasesRef.current = [];
  }, []);

  // Get page canvases
  const getPageCanvases = useCallback(() => pageCanvasesRef.current, []);

  // Add page canvas
  const addPageCanvas = useCallback((pageCanvas: PageCanvas) => {
    pageCanvasesRef.current.push(pageCanvas);
  }, []);

  return {
    pageCanvasesRef,
    renderPage,
    updateCanvasSettings,
    deleteSelected,
    clearCanvases,
    getPageCanvases,
    addPageCanvas,
    addTextAtPosition,
  };
}
