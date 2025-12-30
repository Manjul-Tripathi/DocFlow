import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tags,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  List,
  Link,
  Mail,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  Search,
} from 'lucide-react';
import { useCustomMetadata, FieldType, MetadataDefinition } from '@/hooks/useCustomMetadata';
import { CreateMetadataFieldDialog, MetadataFieldFormData } from './CreateMetadataFieldDialog';
import { supabase } from '@/integrations/supabase/client';

const fieldTypeIcons: Record<FieldType, React.ReactNode> = {
  text: <Type className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  boolean: <ToggleLeft className="h-4 w-4" />,
  select: <List className="h-4 w-4" />,
  'multi-select': <List className="h-4 w-4" />,
  url: <Link className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
};

const fieldTypeLabels: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes/No',
  select: 'Single Select',
  'multi-select': 'Multi Select',
  url: 'URL',
  email: 'Email',
};

interface DocumentWithMetadata {
  id: string;
  file_name: string;
  field_value: string;
}

export function CustomMetadataManager() {
  const { definitions, isLoading, createDefinition, updateDefinition, deleteDefinition, setDocumentMetadata } = useCustomMetadata();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingField, setEditingField] = useState<MetadataDefinition | null>(null);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [fieldDocuments, setFieldDocuments] = useState<Record<string, DocumentWithMetadata[]>>({});
  const [showAddDocsDialog, setShowAddDocsDialog] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [allDocuments, setAllDocuments] = useState<DocumentWithMetadata[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [loadingAllDocs, setLoadingAllDocs] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [loadingFieldDocs, setLoadingFieldDocs] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loadingDocUrl, setLoadingDocUrl] = useState(false);

  const handleOpenCreate = () => {
    setEditingField(null);
    setShowCreateDialog(true);
  };

  const handleOpenEdit = (def: MetadataDefinition) => {
    setEditingField(def);
    setShowCreateDialog(true);
  };

  const handleToggleExpand = async (fieldId: string) => {
    if (expandedFieldId === fieldId) {
      setExpandedFieldId(null);
      return;
    }

    setExpandedFieldId(fieldId);

    // Fetch documents with this metadata field if not already loaded
    if (!fieldDocuments[fieldId]) {
      setLoadingFieldDocs(fieldId);
      try {
        const { data, error } = await (supabase
          .from('document_custom_metadata')
          .select(`
            id,
            field_value,
            documents!inner(id, file_name)
          `)
          .eq('definition_id', fieldId) as any);

        if (error) throw error;

        const docs: DocumentWithMetadata[] = (data || []).map((item: any) => ({
          id: item.documents.id,
          file_name: item.documents.file_name,
          field_value: item.field_value || '',
        }));

        setFieldDocuments(prev => ({ ...prev, [fieldId]: docs }));
      } catch (err) {
        console.error('Error fetching field documents:', err);
        setFieldDocuments(prev => ({ ...prev, [fieldId]: [] }));
      } finally {
        setLoadingFieldDocs(null);
      }
    }
  };

  const handleOpenAddDocs = async (fieldId: string) => {
    setSelectedFieldId(fieldId);
    setSelectedDocIds([]);
    setDocSearchQuery('');
    setShowAddDocsDialog(true);

    // Fetch all documents
    setLoadingAllDocs(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('documents')
        .select('id, file_name')
        .eq('user_id', user.user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAllDocuments((data || []).map((doc: any) => ({
        id: doc.id,
        file_name: doc.file_name,
        field_value: '',
      })));
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoadingAllDocs(false);
    }
  };

  const handleAddDocsToField = async () => {
    if (!selectedFieldId || selectedDocIds.length === 0) return;

    try {
      // Apply empty string value to selected documents
      for (const docId of selectedDocIds) {
        await setDocumentMetadata(docId, selectedFieldId, '');
      }

      // Refresh the field documents
      setFieldDocuments(prev => {
        const updated = { ...prev };
        delete updated[selectedFieldId];
        return updated;
      });

      setShowAddDocsDialog(false);
      setSelectedDocIds([]);
    } catch (err) {
      console.error('Error adding documents to field:', err);
    }
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const handleViewDocument = async (docId: string) => {
    setViewingDocId(docId);
    setLoadingDocUrl(true);
    setDocumentUrl(null);

    try {
      // Fetch document details
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('storage_path, file_name')
        .eq('id', docId)
        .single();

      if (docError || !docData || !docData.storage_path) {
        console.error('Document not found or no storage path');
        setLoadingDocUrl(false);
        return;
      }

      // Get signed URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(docData.storage_path, 3600);

      if (urlError || !urlData?.signedUrl) {
        console.error('Failed to create signed URL');
        setLoadingDocUrl(false);
        return;
      }

      setDocumentUrl(urlData.signedUrl);
    } catch (err) {
      console.error('Error fetching document:', err);
    } finally {
      setLoadingDocUrl(false);
    }
  };

  const handleSubmit = async (formData: MetadataFieldFormData) => {
    const fieldName = formData.field_name || formData.field_label.toLowerCase().replace(/\s+/g, '_');
    const options = formData.options
      ? formData.options.split(',').map(o => o.trim()).filter(Boolean)
      : null;

    if (editingField) {
      await updateDefinition(editingField.id, {
        field_name: fieldName,
        field_label: formData.field_label,
        field_type: formData.field_type,
        description: formData.description || null,
        is_required: formData.is_required,
        default_value: formData.default_value || null,
        options,
        validation_rules: formData.validation_rules || null,
      });
      // Clear cached documents for this field
      setFieldDocuments(prev => {
        const updated = { ...prev };
        delete updated[editingField.id];
        return updated;
      });
    } else {
      const newDefinition = await createDefinition({
        field_name: fieldName,
        field_label: formData.field_label,
        field_type: formData.field_type,
        description: formData.description || null,
        is_required: formData.is_required,
        default_value: formData.default_value || null,
        options,
        sort_order: definitions.length,
        is_active: true,
        validation_rules: formData.validation_rules || null,
      });

      // Apply default value to selected documents
      if (newDefinition && formData.selected_document_ids?.length && formData.default_value) {
        for (const docId of formData.selected_document_ids) {
          await setDocumentMetadata(docId, newDefinition.id, formData.default_value);
        }
      }
    }
    setShowCreateDialog(false);
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
                <Tags className="h-5 w-5 text-primary" />
                Custom Metadata Fields
              </CardTitle>
              <CardDescription>
                Define custom fields to organize and categorize your documents
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {definitions.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Tags className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No custom fields yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Create custom metadata fields to add structured information to your documents,
                like project names, client IDs, or document categories.
              </p>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Field
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2">
                {definitions.map((def) => {
                  const isExpanded = expandedFieldId === def.id;
                  const docs = fieldDocuments[def.id] || [];
                  const isLoadingDocs = loadingFieldDocs === def.id;

                  return (
                    <Collapsible
                      key={def.id}
                      open={isExpanded}
                      onOpenChange={() => handleToggleExpand(def.id)}
                    >
                      <div className="rounded-lg border overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}

                            <div className="p-2 rounded-lg bg-primary/10">
                              {fieldTypeIcons[def.field_type]}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{def.field_label}</span>
                                {def.is_required && (
                                  <Badge variant="secondary" className="text-xs">Required</Badge>
                                )}
                                {docs.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {docs.length} doc{docs.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {fieldTypeLabels[def.field_type]}
                              </div>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleOpenEdit(def)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenAddDocs(def.id)}>
                                  <FilePlus className="h-4 w-4 mr-2" />
                                  Add Documents
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => deleteDefinition(def.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="px-4 pb-4 pt-2 bg-muted/30 border-t space-y-3">
                            {def.description && (
                              <div>
                                <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                                <p className="text-sm">{def.description}</p>
                              </div>
                            )}

                            {def.default_value && (
                              <div>
                                <p className="text-xs text-muted-foreground font-medium mb-1">Default Value</p>
                                <p className="text-sm">{def.default_value}</p>
                              </div>
                            )}

                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-2">
                                Documents with this field ({docs.length})
                              </p>
                              {isLoadingDocs ? (
                                <div className="flex items-center gap-2 py-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm text-muted-foreground">Loading...</span>
                                </div>
                              ) : docs.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">
                                  No documents have this field set yet.
                                </p>
                              ) : (
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {docs.map((doc) => (
                                    <div
                                      key={doc.id}
                                      className="group flex items-center gap-2 text-sm p-2 rounded bg-background border hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all duration-200"
                                      onClick={() => handleViewDocument(doc.id)}
                                    >
                                      <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                                      <span className="truncate flex-1 font-medium group-hover:text-primary group-hover:underline underline-offset-2 transition-colors">
                                        {doc.file_name}
                                      </span>
                                      <span className="text-xs text-muted-foreground/70 truncate max-w-[100px]">
                                        = {doc.field_value || '(empty)'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <CreateMetadataFieldDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleSubmit}
        editingField={editingField}
      />

      <Dialog open={showAddDocsDialog} onOpenChange={setShowAddDocsDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add Documents to Field</DialogTitle>
            <DialogDescription>
              Select documents to add this metadata field to
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {loadingAllDocs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : allDocuments.filter(doc =>
              doc.file_name.toLowerCase().includes(docSearchQuery.toLowerCase())
            ).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No documents found
              </p>
            ) : (
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="p-3 space-y-2">
                  {allDocuments
                    .filter(doc => doc.file_name.toLowerCase().includes(docSearchQuery.toLowerCase()))
                    .map(doc => (
                      <label
                        key={doc.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedDocIds.includes(doc.id)}
                          onCheckedChange={() => toggleDocSelection(doc.id)}
                        />
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate">{doc.file_name}</span>
                      </label>
                    ))}
                </div>
              </ScrollArea>
            )}

            {selectedDocIds.length > 0 && (
              <p className="text-sm text-primary">
                {selectedDocIds.length} document(s) selected
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddDocsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddDocsToField}
              disabled={selectedDocIds.length === 0}
            >
              Add to Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewingDocId !== null} onOpenChange={() => setViewingDocId(null)}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-4 pb-2">
            <DialogTitle>Document Preview</DialogTitle>
          </DialogHeader>

          {loadingDocUrl ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : documentUrl ? (
            <div className="flex-1 h-[calc(85vh-60px)]">
              <iframe
                src={documentUrl}
                className="w-full h-full"
                title="Document Preview"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Unable to load document preview
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

