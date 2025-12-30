import React, { useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MousePointer2 } from 'lucide-react';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface SignaturePosition {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    // Percentages for responsive positioning
    xPercent: number;
    yPercent: number;
}

interface SignatureFieldPlacerProps {
    documentUrl: string;
    onPositionSelected: (position: SignaturePosition) => void;
    selectedPosition?: SignaturePosition | null;
    readOnly?: boolean;
}

export const SignatureFieldPlacer: React.FC<SignatureFieldPlacerProps> = ({
    documentUrl,
    onPositionSelected,
    selectedPosition,
    readOnly = false,
}) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setLoading(false);
        setError(null);
    };

    const onDocumentLoadError = (error: Error) => {
        console.error('Failed to load PDF:', error);
        setError('Failed to load document. Please try again.');
        setLoading(false);
    };

    const handlePageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly || !pageRef.current) return;

        const rect = pageRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Calculate percentages for responsive positioning
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;

        // Default signature size
        const signatureWidth = 150;
        const signatureHeight = 50;

        const position: SignaturePosition = {
            page: currentPage,
            x: x / scale,
            y: y / scale,
            width: signatureWidth,
            height: signatureHeight,
            xPercent,
            yPercent,
        };

        console.log('📍 Position selected:', position);
        onPositionSelected(position);
    }, [currentPage, scale, readOnly, onPositionSelected]);

    const goToPreviousPage = () => {
        setCurrentPage(prev => Math.max(prev - 1, 1));
    };

    const goToNextPage = () => {
        setCurrentPage(prev => Math.min(prev + 1, numPages));
    };

    const zoomIn = () => {
        setScale(prev => Math.min(prev + 0.2, 2.0));
    };

    const zoomOut = () => {
        setScale(prev => Math.max(prev - 0.2, 0.5));
    };

    // Check if selected position is on current page
    const showMarker = selectedPosition && selectedPosition.page === currentPage;

    return (
        <Card className="p-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPreviousPage}
                        disabled={currentPage <= 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium px-2">
                        Page {currentPage} of {numPages || '?'}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextPage}
                        disabled={currentPage >= numPages}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium px-2">{Math.round(scale * 100)}%</span>
                    <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 2.0}>
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Instruction */}
            {!readOnly && !selectedPosition && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                    <MousePointer2 className="h-5 w-5 text-blue-600" />
                    <span className="text-sm text-blue-700">
                        Click on the document where you want to place your signature
                    </span>
                </div>
            )}

            {selectedPosition && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                    <span className="text-sm text-green-700">
                        ✓ Signature will be placed on page {selectedPosition.page}
                    </span>
                </div>
            )}

            {/* PDF Container */}
            <div
                ref={containerRef}
                className="relative border rounded-lg overflow-auto bg-gray-100"
                style={{ maxHeight: '600px' }}
            >
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                        <div className="flex flex-col items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <span className="mt-2 text-sm text-muted-foreground">Loading document...</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-8 text-center text-red-600">
                        <p>{error}</p>
                    </div>
                )}

                <Document
                    file={documentUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={null}
                >
                    <div
                        ref={pageRef}
                        className={`relative inline-block ${!readOnly ? 'cursor-crosshair' : ''}`}
                        onClick={handlePageClick}
                    >
                        <Page
                            pageNumber={currentPage}
                            scale={scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                        />

                        {/* Signature Position Marker */}
                        {showMarker && (
                            <div
                                className="absolute border-2 border-green-500 bg-green-100/50 rounded pointer-events-none flex items-center justify-center"
                                style={{
                                    left: `${selectedPosition.xPercent}%`,
                                    top: `${selectedPosition.yPercent}%`,
                                    width: selectedPosition.width * scale,
                                    height: selectedPosition.height * scale,
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                <span className="text-xs text-green-700 font-medium">Sign Here</span>
                            </div>
                        )}
                    </div>
                </Document>
            </div>
        </Card>
    );
};

export default SignatureFieldPlacer;
