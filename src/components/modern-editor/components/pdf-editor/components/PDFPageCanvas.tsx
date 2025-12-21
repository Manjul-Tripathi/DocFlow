import React, { useEffect, useRef, memo } from 'react';
import * as fabric from 'fabric';

interface PDFPageCanvasProps {
  pageNumber: number;
  pdfDoc: any;
  scale: number;
  fabricCanvas: fabric.Canvas | null;
  onCanvasReady: (pageNumber: number, canvas: fabric.Canvas) => void;
  canvasContainerRef: React.RefObject<HTMLDivElement>;
  width?: number;
  height?: number;
}

export const PDFPageCanvas = memo(({
  pageNumber,
  pdfDoc,
  scale,
  fabricCanvas,
  onCanvasReady,
  canvasContainerRef,
  width,
  height,
}: PDFPageCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !pdfDoc) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        // Create fabric canvas overlay if needed
        if (!fabricCanvas && containerRef.current) {
          const fabricEl = document.createElement('canvas');
          fabricEl.width = viewport.width;
          fabricEl.height = viewport.height;
          fabricEl.style.position = 'absolute';
          fabricEl.style.left = '0';
          fabricEl.style.top = '0';
          fabricEl.style.pointerEvents = 'auto';
          containerRef.current.appendChild(fabricEl);

          const fc = new fabric.Canvas(fabricEl, {
            width: viewport.width,
            height: viewport.height,
            selection: true,
            preserveObjectStacking: true,
          });

          onCanvasReady(pageNumber, fc);
        }
      } catch (error) {
        console.error(`Error rendering page ${pageNumber}:`, error);
      }
    };

    renderPage();
  }, [pdfDoc, pageNumber, scale, onCanvasReady, fabricCanvas]);

  return (
    <div 
      ref={containerRef}
      className="relative mb-4 shadow-lg bg-white"
      style={{ width: width || 'auto', height: height || 'auto' }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
});

PDFPageCanvas.displayName = 'PDFPageCanvas';
