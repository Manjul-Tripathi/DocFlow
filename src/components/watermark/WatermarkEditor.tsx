import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Droplets,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  Loader2,
  FileText,
  Search,
  Check,
  X,
  Download,
  Eye,
} from 'lucide-react';
import { useWatermark, WatermarkSettings, WatermarkPosition, WatermarkType } from '@/hooks/useWatermark';
import { WatermarkPreview } from './WatermarkPreview';
import { supabase } from '@/integrations/supabase/client';
import { DocumentViewer } from '../document-manager/DocumentViewer';

const positionOptions: { value: WatermarkPosition; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'tile', label: 'Tile (Repeat)' },
];

const fontOptions = [
  'Arial',
  'Times New Roman',
  'Helvetica',
  'Georgia',
  'Courier New',
  'Verdana',
];

interface DocumentItem {
  id: string;
  file_name: string;
}

export function WatermarkEditor() {
  const { watermarks, isLoading, createWatermark, updateWatermark, deleteWatermark, downloadDocumentWithWatermark } = useWatermark();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWatermark, setEditingWatermark] = useState<WatermarkSettings | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    watermark_type: 'text' as WatermarkType,
    text_content: 'CONFIDENTIAL',
    font_family: 'Arial',
    font_size: 48,
    text_color: '#00000033',
    rotation: -45,
    opacity: 0.3,
    position: 'center' as WatermarkPosition,
    include_date: false,
    include_username: false,
    is_default: false,
    document_id: null as string | null,
    document_name: null as string | null, // For display only
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Document picker state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [showDocResults, setShowDocResults] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentItem | null>(null);

  // State for viewing a watermarked document from the list
  const [viewingWatermark, setViewingWatermark] = useState<WatermarkSettings | null>(null);
  const [viewingDoc, setViewingDoc] = useState<any>(null);

  const resetForm = () => {
    setFormData({
      name: '',
      watermark_type: 'text',
      text_content: 'CONFIDENTIAL',
      font_family: 'Arial',
      font_size: 48,
      text_color: '#00000033',
      rotation: -45,
      opacity: 0.3,
      position: 'center',
      include_date: false,
      include_username: false,
      is_default: false,
      document_id: null,
      document_name: null,
    });
    setEditingWatermark(null);
    setDocSearchQuery('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const handleOpenEdit = (wm: WatermarkSettings) => {
    setFormData({
      name: wm.name,
      watermark_type: wm.watermark_type,
      text_content: wm.text_content || 'CONFIDENTIAL',
      font_family: wm.font_family,
      font_size: wm.font_size,
      text_color: wm.text_color,
      rotation: wm.rotation,
      opacity: wm.opacity,
      position: wm.position,
      include_date: wm.include_date,
      include_username: wm.include_username,
      is_default: wm.is_default,
      document_id: wm.document_id,
      document_name: wm.document?.file_name || null,
    });
    setEditingWatermark(wm);
    setShowCreateDialog(true);
  };

  // Fetch documents for picker
  useEffect(() => {
    if (showCreateDialog) {
      const fetchDocuments = async () => {
        setLoadingDocs(true);
        try {
          const { data: user } = await supabase.auth.getUser();
          if (!user.user) return;

          let query = supabase
            .from('documents')
            .select('id, file_name')
            .eq('user_id', user.user.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(20);

          if (docSearchQuery) {
            query = query.ilike('file_name', `%${docSearchQuery}%`);
          }

          const { data, error } = await query;
          if (error) throw error;
          setDocuments(data || []);
        } catch (err) {
          console.error('Error fetching documents:', err);
        } finally {
          setLoadingDocs(false);
        }
      };

      const timer = setTimeout(fetchDocuments, 300);
      return () => clearTimeout(timer);
    }
  }, [showCreateDialog, docSearchQuery]);

  // Fetch full document data when opening preview
  useEffect(() => {
    if (!showDocumentPreview || !formData.document_id) {
      setPreviewDocument(null);
      return;
    }

    const fetchFullDocument = async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', formData.document_id)
          .single();

        if (error) throw error;
        setPreviewDocument(data as any);
      } catch (err) {
        console.error('Error fetching document:', err);
        setPreviewDocument(null);
      }
    };

    fetchFullDocument();
  }, [showDocumentPreview, formData.document_id]);

  // Fetch document when viewing a watermark from the list
  useEffect(() => {
    if (!viewingWatermark || !viewingWatermark.document_id) {
      setViewingDoc(null);
      return;
    }

    const fetchDoc = async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', viewingWatermark.document_id)
          .single();

        if (error) throw error;
        setViewingDoc(data);
      } catch (err) {
        console.error('Error fetching document:', err);
        setViewingDoc(null);
      }
    };

    fetchDoc();
  }, [viewingWatermark]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const submitData = {
        name: formData.name,
        watermark_type: formData.watermark_type,
        text_content: formData.text_content,
        font_family: formData.font_family,
        font_size: formData.font_size,
        text_color: formData.text_color,
        rotation: formData.rotation,
        opacity: formData.opacity,
        position: formData.position,
        include_date: formData.include_date,
        include_username: formData.include_username,
        is_default: formData.is_default,
        document_id: formData.document_id,
        image_url: null,
      };

      if (editingWatermark) {
        await updateWatermark(editingWatermark.id, submitData);
      } else {
        await createWatermark(submitData);
      }
      setShowCreateDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5 text-primary" />
                Document Watermarks
              </CardTitle>
              <CardDescription>
                Create and manage watermarks to protect your documents
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Watermark
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {watermarks.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Droplets className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No watermarks created</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Create watermarks to add text or images to your documents for branding or security purposes.
              </p>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Watermark
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {watermarks.map((wm) => (
                  <Card key={wm.id} className="relative overflow-hidden hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-medium text-sm truncate">{wm.name}</h4>
                            {wm.is_default && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                <Star className="h-2.5 w-2.5 mr-0.5 fill-current" />
                                Default
                              </Badge>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {wm.watermark_type === 'text' ? `"${wm.text_content}"` : 'Image'} • {wm.position}
                          </p>
                          {wm.document?.file_name && (
                            <div className="flex items-center gap-1 text-[10px] text-primary/80 mt-0.5 truncate">
                              <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="truncate">{wm.document.file_name}</span>
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(wm)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {!wm.is_default && (
                              <DropdownMenuItem onClick={() => updateWatermark(wm.id, { is_default: true })}>
                                <Star className="h-4 w-4 mr-2" />
                                Set as Default
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => deleteWatermark(wm.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                            {wm.document_id && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => setViewingWatermark(wm)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Document
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => downloadDocumentWithWatermark(wm.document_id!, wm, wm.document?.file_name)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download with Watermark
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <WatermarkPreview
                        settings={wm}
                        width={150}
                        height={100}
                        className="w-full rounded"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWatermark ? 'Edit Watermark' : 'Create Watermark'}
            </DialogTitle>
            <DialogDescription>
              Configure watermark settings and preview
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-6 py-4">
              {/* Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Confidential Draft"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                {/* Document Selection */}
                <div className="space-y-2">
                  <Label>Apply to Document</Label>
                  {formData.document_id ? (
                    <div className="flex items-center justify-between p-2 rounded-md border bg-accent/20">
                      <div className="flex items-center gap-2 text-sm truncate">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium truncate">{formData.document_name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setFormData(prev => ({ ...prev, document_id: null, document_name: null }))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search documents..."
                          className="pl-8"
                          value={docSearchQuery}
                          onChange={(e) => {
                            setDocSearchQuery(e.target.value);
                            setShowDocResults(true);
                          }}
                          onFocus={() => setShowDocResults(true)}
                        />
                      </div>

                      {showDocResults && (docSearchQuery || documents.length > 0) && (
                        <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
                          <ScrollArea className="h-[200px] overflow-y-auto">
                            <div className="p-1">
                              {loadingDocs ? (
                                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Loading...
                                </div>
                              ) : documents.length === 0 ? (
                                <div className="py-2 px-4 text-sm text-muted-foreground text-center">
                                  No documents found
                                </div>
                              ) : (
                                documents.map(doc => (
                                  <div
                                    key={doc.id}
                                    className="flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm"
                                    onClick={() => {
                                      setFormData(prev => ({
                                        ...prev,
                                        document_id: doc.id,
                                        document_name: doc.file_name
                                      }));
                                      setShowDocResults(false);
                                      setDocSearchQuery('');
                                    }}
                                  >
                                    <FileText className="h-4 w-4 opacity-50" />
                                    <span className="truncate">{doc.file_name}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Simple overlay to close results when clicking outside */}
                      {showDocResults && (
                        <div
                          className="fixed inset-0 z-0"
                          onClick={() => setShowDocResults(false)}
                        />
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Leave empty to create a general watermark template
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="text_content">Watermark Text</Label>
                  <Input
                    id="text_content"
                    placeholder="CONFIDENTIAL"
                    value={formData.text_content}
                    onChange={(e) => setFormData(prev => ({ ...prev, text_content: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Font</Label>
                    <Select
                      value={formData.font_family}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, font_family: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map(font => (
                          <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Select
                      value={formData.position}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, position: v as WatermarkPosition }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {positionOptions.map(pos => (
                          <SelectItem key={pos.value} value={pos.value}>
                            {pos.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Font Size: {formData.font_size}px</Label>
                  <Slider
                    value={[formData.font_size]}
                    onValueChange={([v]) => setFormData(prev => ({ ...prev, font_size: v }))}
                    min={12}
                    max={120}
                    step={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Rotation: {formData.rotation}°</Label>
                  <Slider
                    value={[formData.rotation]}
                    onValueChange={([v]) => setFormData(prev => ({ ...prev, rotation: v }))}
                    min={-90}
                    max={90}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Opacity: {Math.round(formData.opacity * 100)}%</Label>
                  <Slider
                    value={[formData.opacity]}
                    onValueChange={([v]) => setFormData(prev => ({ ...prev, opacity: v }))}
                    min={0.05}
                    max={1}
                    step={0.05}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="text_color">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="text_color"
                      type="color"
                      value={formData.text_color.slice(0, 7)}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        text_color: e.target.value + Math.round(formData.opacity * 255).toString(16).padStart(2, '0')
                      }))}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={formData.text_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, text_color: e.target.value }))}
                      placeholder="#00000033"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Include Date</Label>
                    <Switch
                      checked={formData.include_date}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, include_date: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Include Username</Label>
                    <Switch
                      checked={formData.include_username}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, include_username: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Set as Default</Label>
                    <Switch
                      checked={formData.is_default}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_default: checked }))}
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview</Label>
                <WatermarkPreview
                  settings={formData}
                  width={300}
                  height={400}
                  className="w-full"
                  documentId={formData.document_id}
                />
                {formData.document_id ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-center">
                      Preview shows watermark on sample content
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        // Close create dialog first, then open document preview
                        setShowCreateDialog(false);
                        // Small delay to allow dialog close animation
                        setTimeout(() => setShowDocumentPreview(true), 200);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Actual Document with Watermark
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Select a document to preview watermark
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingWatermark ? (
                  'Save Changes'
                ) : (
                  'Create Watermark'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Document Preview with Watermark - pass current form settings */}
      {formData.document_id && previewDocument && showDocumentPreview && (
        <DocumentViewer
          document={previewDocument}
          isOpen={showDocumentPreview}
          onClose={() => {
            setShowDocumentPreview(false);
            // Reopen the create/edit dialog after closing preview
            setTimeout(() => setShowCreateDialog(true), 200);
          }}
          customWatermark={{
            text_content: formData.text_content,
            font_family: formData.font_family,
            font_size: formData.font_size,
            text_color: formData.text_color,
            rotation: formData.rotation,
            opacity: formData.opacity,
            position: formData.position,
            include_date: formData.include_date,
            include_username: formData.include_username,
            watermark_type: formData.watermark_type,
          }}
        />
      )}

      {/* View Watermarked Document from List - pass the saved watermark settings */}
      {viewingWatermark && viewingDoc && (
        <DocumentViewer
          document={viewingDoc}
          isOpen={!!viewingWatermark}
          onClose={() => setViewingWatermark(null)}
          customWatermark={viewingWatermark}
        />
      )}
    </>
  );
}
