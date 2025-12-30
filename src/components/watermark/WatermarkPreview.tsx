import React, { useRef, useEffect, useState } from 'react';
import { WatermarkSettings, useWatermark } from '@/hooks/useWatermark';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface WatermarkPreviewProps {
  settings: Partial<WatermarkSettings>;
  width?: number;
  height?: number;
  className?: string;
  documentId?: string | null;
}

export function WatermarkPreview({
  settings,
  width = 400,
  height = 300,
  className = '',
  documentId,
}: WatermarkPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { applyWatermarkToCanvas } = useWatermark();
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Fetch document when documentId changes
  useEffect(() => {
    if (!documentId) {
      setDocumentUrl(null);
      return;
    }

    const fetchDocument = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('file_path, thumbnail_url')
          .eq('id', documentId)
          .single();

        if (error) throw error;

        // Use thumbnail or file path
        if (data.thumbnail_url) {
          setDocumentUrl(data.thumbnail_url);
        } else if (data.file_path) {
          // Get signed URL from storage (since bucket is not public)
          const { data: urlData, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(data.file_path, 3600); // 1 hour expiry

          if (urlError) {
            console.error('Error creating signed URL:', urlError);
            setDocumentUrl(null);
          } else {
            setDocumentUrl(urlData.signedUrl);
          }
        }
      } catch (err) {
        console.error('Error fetching document:', err);
        setDocumentUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [documentId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (loading) {
      // Show loading state
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#999';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Loading document...', width / 2, height / 2);
      return;
    }

    if (documentUrl && !imageLoaded) {
      // Load actual document image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Calculate scaling to fit canvas
        const scale = Math.min(width / img.width, height / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const x = (width - scaledWidth) / 2;
        const y = (height - scaledHeight) / 2;

        // Draw document
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

        // Apply watermark
        applyWatermark(ctx, canvas);
        setImageLoaded(true);
      };
      img.onerror = () => {
        // Fallback to mock document
        drawMockDocument(ctx);
        applyWatermark(ctx, canvas);
      };
      img.src = documentUrl;
      return;
    }

    // Draw mock document or apply watermark if image loaded
    if (!documentUrl || imageLoaded) {
      if (!documentUrl) {
        drawMockDocument(ctx);
      }
      applyWatermark(ctx, canvas);
    }
  }, [settings, width, height, applyWatermarkToCanvas, documentUrl, loading, imageLoaded]);

  const drawMockDocument = (ctx: CanvasRenderingContext2D) => {
    // Draw sample document content
    ctx.fillStyle = '#f0f0f0';
    for (let y = 40; y < height - 20; y += 20) {
      const lineWidth = Math.random() * 100 + 200;
      ctx.fillRect(20, y, lineWidth, 10);
    }

    // Draw header
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(20, 15, 150, 15);
  };

  const applyWatermark = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (settings.text_content || settings.watermark_type === 'text') {
      const fullSettings: WatermarkSettings = {
        id: '',
        document_id: null,
        user_id: '',
        name: 'Preview',
        is_default: false,
        watermark_type: settings.watermark_type || 'text',
        text_content: settings.text_content || 'CONFIDENTIAL',
        font_family: settings.font_family || 'Arial',
        font_size: settings.font_size || 48,
        text_color: settings.text_color || '#00000033',
        rotation: settings.rotation ?? -45,
        opacity: settings.opacity ?? 0.3,
        position: settings.position || 'center',
        image_url: settings.image_url || null,
        include_date: settings.include_date || false,
        include_username: settings.include_username || false,
        created_at: '',
        updated_at: '',
      };

      applyWatermarkToCanvas(ctx, canvas, fullSettings, 'User');
    }
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`border rounded-lg shadow-sm ${className}`}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
