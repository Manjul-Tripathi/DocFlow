import * as fabric from 'fabric';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Tool types available in the PDF editor
export type ToolType = 
  | 'select' 
  | 'text' 
  | 'draw' 
  | 'highlight' 
  | 'rectangle' 
  | 'circle' 
  | 'line' 
  | 'arrow' 
  | 'eraser' 
  | 'image' 
  | 'pan';

// Page canvas information
export interface PageCanvas {
  pageNum: number;
  fabricCanvas: fabric.Canvas;
  scale: number;
  originalWidth: number;
  originalHeight: number;
}

// History state for undo/redo
export interface HistoryState {
  pageNum: number;
  json: string;
}

// PDF Editor props
export interface PDFEditorProps {
  documentId?: string;
  documentName?: string;
  pdfUrl?: string;
  onSave?: (pdfBytes: Uint8Array) => void;
  onClose?: () => void;
  readOnly?: boolean;
}

// Tool settings
export interface ToolSettings {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
}

// PDF Document refs
export interface PDFRefs {
  pdfDoc: pdfjs.PDFDocumentProxy | null;
  pdfLibDoc: PDFDocument | null;
  pdfBytes: Uint8Array | null;
  pageCanvases: PageCanvas[];
}

// Drawing state
export interface DrawingState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  tempShape: fabric.Object | null;
}
