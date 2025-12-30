import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { FieldType, MetadataDefinition } from '@/hooks/useCustomMetadata';

interface CreateMetadataFieldDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: MetadataFieldFormData) => Promise<void>;
    editingField?: MetadataDefinition | null;
}

export interface MetadataFieldFormData {
    field_name: string;
    field_label: string;
    field_type: FieldType;
    description: string;
    is_required: boolean;
    default_value: string;
    options: string;
    validation_rules?: Record<string, any>;
    selected_document_ids?: string[];
}

export function CreateMetadataFieldDialog({
    open,
    onOpenChange,
    onSubmit,
    editingField,
}: CreateMetadataFieldDialogProps) {
    const [formData, setFormData] = useState<MetadataFieldFormData>({
        field_name: '',
        field_label: '',
        field_type: 'text',
        description: '',
        is_required: false,
        default_value: '',
        options: '',
        validation_rules: {},
        selected_document_ids: [],
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            if (editingField) {
                setFormData({
                    field_name: editingField.field_name,
                    field_label: editingField.field_label,
                    field_type: editingField.field_type,
                    description: editingField.description || '',
                    is_required: false,
                    default_value: '',
                    options: '',
                    validation_rules: {},
                    selected_document_ids: [],
                });
            } else {
                setFormData({
                    field_name: '',
                    field_label: '',
                    field_type: 'text',
                    description: '',
                    is_required: false,
                    default_value: '',
                    options: '',
                    validation_rules: {},
                    selected_document_ids: [],
                });
            }
        }
    }, [open, editingField]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.field_label.trim()) return;

        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {editingField ? 'Edit Metadata Field' : 'Create Metadata Field'}
                    </DialogTitle>
                    <DialogDescription>
                        {editingField
                            ? 'Update the field properties'
                            : 'Add a new metadata field for your documents'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="field_label">Field Label *</Label>
                            <Input
                                id="field_label"
                                placeholder="e.g., Client Name, Project Code, Department"
                                value={formData.field_label}
                                onChange={(e) => setFormData(prev => ({ ...prev, field_label: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Optional description for this field"
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : editingField ? (
                                'Save Changes'
                            ) : (
                                'Create Field'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
