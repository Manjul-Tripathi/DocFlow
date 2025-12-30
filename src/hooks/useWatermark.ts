import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';
export type WatermarkType = 'text' | 'image' | 'pattern';

export interface WatermarkSettings {
  id: string;
  document_id: string | null;
  user_id: string;
  name: string;
  is_default: boolean;
  watermark_type: WatermarkType;
  text_content: string | null;
  font_family: string;
  font_size: number;
  text_color: string;
  rotation: number;
  opacity: number;
  position: WatermarkPosition;
  image_url: string | null;
  include_date: boolean;
  include_username: boolean;
  created_at: string;
  updated_at: string;
  document?: {
    file_name: string;
  };
}

export function useWatermark() {
  const [watermarks, setWatermarks] = useState<WatermarkSettings[]>([]);
  const [defaultWatermark, setDefaultWatermark] = useState<WatermarkSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchWatermarks = useCallback(async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await (supabase
        .from('document_watermarks')
        .select(`
          *,
          document:documents(file_name)
        `)
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false }) as any);

      if (error) throw error;

      const allWatermarks = (data || []) as WatermarkSettings[];
      setWatermarks(allWatermarks);
      setDefaultWatermark(allWatermarks.find(w => w.is_default) || null);
    } catch (error) {
      console.error('Error fetching watermarks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatermarks();
  }, [fetchWatermarks]);

  const createWatermark = useCallback(async (
    settings: Omit<WatermarkSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // If setting as default, unset other defaults first
      if (settings.is_default) {
        await supabase
          .from('document_watermarks')
          .update({ is_default: false })
          .eq('user_id', user.user.id);
      }

      const { data, error } = await supabase
        .from('document_watermarks')
        .insert({
          ...settings,
          user_id: user.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Watermark created',
        description: `Watermark "${settings.name}" has been saved`,
      });

      fetchWatermarks();
      return data;
    } catch (error) {
      console.error('Error creating watermark:', error);
      toast({
        title: 'Error',
        description: 'Failed to create watermark',
        variant: 'destructive',
      });
      return null;
    }
  }, [fetchWatermarks, toast]);

  const updateWatermark = useCallback(async (
    id: string,
    updates: Partial<WatermarkSettings>
  ) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // If setting as default, unset other defaults first
      if (updates.is_default) {
        await supabase
          .from('document_watermarks')
          .update({ is_default: false })
          .eq('user_id', user.user.id);
      }

      const { error } = await supabase
        .from('document_watermarks')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Watermark updated',
        description: 'Watermark settings have been updated',
      });

      fetchWatermarks();
    } catch (error) {
      console.error('Error updating watermark:', error);
      toast({
        title: 'Error',
        description: 'Failed to update watermark',
        variant: 'destructive',
      });
    }
  }, [fetchWatermarks, toast]);

  const deleteWatermark = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('document_watermarks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Watermark deleted',
        description: 'Watermark has been removed',
      });

      fetchWatermarks();
    } catch (error) {
      console.error('Error deleting watermark:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete watermark',
        variant: 'destructive',
      });
    }
  }, [fetchWatermarks, toast]);

  const applyWatermarkToCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    settings: WatermarkSettings,
    username?: string
  ) => {
    ctx.save();
    ctx.globalAlpha = settings.opacity;

    let text = settings.text_content || '';
    if (settings.include_date) {
      text += ` ${new Date().toLocaleDateString()}`;
    }
    if (settings.include_username && username) {
      text += ` ${username}`;
    }

    ctx.font = `${settings.font_size}px ${settings.font_family}`;
    ctx.fillStyle = settings.text_color;

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = settings.font_size;

    if (settings.position === 'tile') {
      const spacing = Math.max(textWidth, textHeight) * 1.5;
      for (let y = -canvas.height; y < canvas.height * 2; y += spacing) {
        for (let x = -canvas.width; x < canvas.width * 2; x += spacing) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((settings.rotation * Math.PI) / 180);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    } else {
      let x = canvas.width / 2;
      let y = canvas.height / 2;

      switch (settings.position) {
        case 'top-left':
          x = textWidth / 2 + 20;
          y = textHeight + 20;
          break;
        case 'top-right':
          x = canvas.width - textWidth / 2 - 20;
          y = textHeight + 20;
          break;
        case 'bottom-left':
          x = textWidth / 2 + 20;
          y = canvas.height - 20;
          break;
        case 'bottom-right':
          x = canvas.width - textWidth / 2 - 20;
          y = canvas.height - 20;
          break;
      }

      ctx.translate(x, y);
      ctx.rotate((settings.rotation * Math.PI) / 180);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
    }

    ctx.restore();
  }, []);

  // Download document with watermark overlay applied
  const downloadDocumentWithWatermark = useCallback(async (
    documentId: string,
    settings: WatermarkSettings,
    fileName?: string
  ) => {
    try {
      toast({
        title: 'Preparing download...',
        description: 'Applying watermark to document',
      });

      // Fetch document details
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('file_name, storage_path, file_type, original_url')
        .eq('id', documentId)
        .single();

      if (docError || !doc) {
        console.error('Document fetch error:', docError);
        throw new Error('Document not found');
      }

      console.log('Document data:', doc);

      // Get document URL - try storage_path first with signed URL, then original_url
      let documentUrl: string | null = null;

      if (doc.storage_path) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.storage_path, 3600);

        if (!signedError && signedData?.signedUrl) {
          documentUrl = signedData.signedUrl;
        } else {
          console.error('Signed URL error:', signedError);
        }
      }

      // Fallback to original_url
      if (!documentUrl && doc.original_url) {
        documentUrl = doc.original_url;
      }

      if (!documentUrl) {
        throw new Error('Could not get document URL - no storage_path or original_url found');
      }

      console.log('Document URL:', documentUrl);

      // Determine file type
      const fileType = doc.file_type?.toLowerCase() || '';
      const fileName = doc.file_name?.toLowerCase() || '';
      const isImage = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(fileType) ||
        fileName.match(/\.(png|jpg|jpeg|gif|webp)$/i);
      const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');

      console.log('File type:', fileType, 'isImage:', isImage, 'isPdf:', isPdf);

      // Handle PDF via backend API
      if (isPdf) {
        toast({
          title: 'Applying watermark to PDF...',
          description: 'This may take a moment for large files.',
        });

        // Call backend API for PDF watermarking
        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/api/watermarks/apply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            document_id: documentId,
            watermark_text: settings.text_content || 'CONFIDENTIAL',
            font_family: settings.font_family || 'Helvetica',
            font_size: settings.font_size || 48,
            rotation: settings.rotation || -45,
            opacity: settings.opacity || 0.3,
            color: settings.text_color?.slice(0, 7) || '#000000',
            position: settings.position || 'center',
            save_to_documents: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to watermark PDF: ${errorText}`);
        }

        // Parse JSON response - document is saved to storage
        const result = await response.json();

        if (result.success) {
          toast({
            title: 'Watermark Applied! ✓',
            description: `"${result.file_name}" has been saved to your Documents.`,
          });
        } else {
          throw new Error('Failed to save watermarked document');
        }

        return;
      }

      // Check if it's a supported image type
      if (!isImage) {
        toast({
          title: 'Unsupported file type',
          description: 'Watermark download works with images (PNG, JPG) and PDFs.',
          variant: 'destructive',
        });
        return;
      }

      // Create canvas and apply watermark
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not create canvas context');
      }

      // Fetch image as blob to avoid CORS issues
      console.log('Fetching document from:', documentUrl);
      const response = await fetch(documentUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Load the image from blob URL
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Set canvas size to image size
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw the original image
          ctx.drawImage(img, 0, 0);

          // Get current user for username watermark
          supabase.auth.getUser().then(({ data: userData }) => {
            const username = userData?.user?.email?.split('@')[0] || 'User';

            // Apply watermark
            applyWatermarkToCanvas(ctx, canvas, settings, username);
            URL.revokeObjectURL(blobUrl); // Clean up
            resolve();
          }).catch(() => {
            applyWatermarkToCanvas(ctx, canvas, settings, 'User');
            URL.revokeObjectURL(blobUrl); // Clean up
            resolve();
          });
        };
        img.onerror = (e) => {
          console.error('Image load error:', e);
          URL.revokeObjectURL(blobUrl);
          reject(new Error('Failed to load document image'));
        };
        img.src = blobUrl;
      });

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          toast({
            title: 'Error',
            description: 'Failed to create watermarked image',
            variant: 'destructive',
          });
          return;
        }

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        // Generate filename
        const baseName = fileName || doc.file_name || 'document';
        const ext = baseName.match(/\.([^.]+)$/)?.[1] || 'png';
        const nameWithoutExt = baseName.replace(/\.[^.]+$/, '');
        link.download = `${nameWithoutExt}_watermarked.${ext}`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: 'Download complete',
          description: 'Document with watermark has been downloaded',
        });
      }, isImage ? 'image/png' : 'image/png', 0.95);

    } catch (error) {
      console.error('Error downloading with watermark:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download with watermark',
        variant: 'destructive',
      });
    }
  }, [applyWatermarkToCanvas, toast]);

  return {
    watermarks,
    defaultWatermark,
    isLoading,
    createWatermark,
    updateWatermark,
    deleteWatermark,
    applyWatermarkToCanvas,
    downloadDocumentWithWatermark,
    refetch: fetchWatermarks,
  };
}
