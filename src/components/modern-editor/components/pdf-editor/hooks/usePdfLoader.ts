import { useCallback, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Set the worker source for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export function usePdfLoader() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const pdfLibDocRef = useRef<PDFDocument | null>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);

  const loadPdf = useCallback(async (pdfUrl: string) => {
    if (!pdfUrl) {
      setError('No PDF URL provided');
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('[PDFLoader] Loading PDF from:', pdfUrl);

      // Fetch PDF bytes
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      pdfBytesRef.current = pdfBytes;
      console.log('[PDFLoader] PDF bytes loaded:', pdfBytes.length);

      // Load with PDF.js
      const loadingTask = pdfjs.getDocument({ data: pdfBytes });
      const pdfDoc = await loadingTask.promise;
      pdfDocRef.current = pdfDoc;
      setTotalPages(pdfDoc.numPages);
      console.log('[PDFLoader] PDF loaded, pages:', pdfDoc.numPages);

      // Load with pdf-lib for saving (lazy load, will be done on first save)
      try {
        const pdfLibDoc = await PDFDocument.load(pdfBytes);
        pdfLibDocRef.current = pdfLibDoc;
      } catch (pdfLibErr) {
        console.warn('[PDFLoader] Warning: pdf-lib failed to load PDF, will retry on save:', pdfLibErr);
      }

      setLoading(false);
      return pdfDoc;
    } catch (err) {
      console.error('[PDFLoader] Error loading PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
      setLoading(false);
      return null;
    }
  }, []);

  const getPdfBytes = useCallback(() => pdfBytesRef.current, []);
  const getPdfLibDoc = useCallback(() => pdfLibDocRef.current, []);
  const setPdfLibDoc = useCallback((doc: PDFDocument | null) => {
    pdfLibDocRef.current = doc;
  }, []);
  const setPdfBytes = useCallback((bytes: Uint8Array | null) => {
    pdfBytesRef.current = bytes;
  }, []);

  return {
    loading,
    error,
    totalPages,
    pdfDocRef,
    loadPdf,
    getPdfBytes,
    getPdfLibDoc,
    setPdfLibDoc,
    setPdfBytes,
    setError,
    setLoading,
  };
}
