import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Folder,
  Briefcase,
  Receipt,
  Award,
  User,
  FileText,
  Star,
  Clock,
  Heart,
  Shield,
  Zap,
  Target,
  Loader2
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/config/api";

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFolderCreated: () => void;
  initialData?: {
    id: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    is_smart?: boolean;
    ai_criteria?: any;
  };
}

const iconOptions = [
  { value: 'Folder', icon: Folder, label: 'Folder' },
  { value: 'Briefcase', icon: Briefcase, label: 'Briefcase' },
  { value: 'Receipt', icon: Receipt, label: 'Receipt' },
  { value: 'Award', icon: Award, label: 'Award' },
  { value: 'User', icon: User, label: 'User' },
  { value: 'FileText', icon: FileText, label: 'Document' },
  { value: 'Star', icon: Star, label: 'Star' },
  { value: 'Clock', icon: Clock, label: 'Clock' },
  { value: 'Heart', icon: Heart, label: 'Heart' },
  { value: 'Shield', icon: Shield, label: 'Shield' },
  { value: 'Zap', icon: Zap, label: 'Zap' },
  { value: 'Target', icon: Target, label: 'Target' }
];

const colorOptions = [
  '#dc2626', // red
  '#ea580c', // orange
  '#d97706', // amber
  '#65a30d', // lime
  '#059669', // emerald
  '#0891b2', // cyan
  '#2563eb', // blue
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#dc2626'  // pink
];

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onFolderCreated,
  initialData
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    color: initialData?.color || '#2563eb',
    icon: initialData?.icon || 'Folder',
    isSmart: initialData?.is_smart || false,
    smartCriteria: {
      contentTypes: initialData?.ai_criteria?.content_type || [] as string[],
      importanceScore: initialData?.ai_criteria?.importance_score?.min ? initialData.ai_criteria.importance_score.min * 100 : 0,
      daysOld: 0,
      keywords: [] as string[]
    }
  });
  const [isCreating, setIsCreating] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const { toast } = useToast();

  const contentTypeOptions = [
    'contract', 'agreement', 'legal', 'invoice', 'receipt', 'financial',
    'report', 'presentation', 'spreadsheet', 'image', 'pdf', 'personal',
    'business', 'medical', 'insurance', 'tax', 'certificate'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a folder name",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        throw new Error('Not authenticated');
      }

      let aiCriteria = null;
      if (formData.isSmart) {
        aiCriteria = {
          content_type: formData.smartCriteria.contentTypes,
          importance_score: formData.smartCriteria.importanceScore > 0 
            ? { min: formData.smartCriteria.importanceScore / 100 }
            : null,
          days_old: formData.smartCriteria.daysOld > 0 
            ? formData.smartCriteria.daysOld
            : null,
          keywords: formData.smartCriteria.keywords
        };
      }

      // Get the max order_index to put new folders at the top
      let nextOrderIndex = 1;
      if (!initialData?.id) {
        const { data: maxOrderData } = await supabase
          .from('smart_folders')
          .select('order_index')
          .eq('user_id', user.user.id)
          .order('order_index', { ascending: false })
          .limit(1);
        
        if (maxOrderData && maxOrderData.length > 0 && maxOrderData[0].order_index != null) {
          nextOrderIndex = maxOrderData[0].order_index + 1;
        }
      }

      const folderData = {
        user_id: user.user.id,
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color,
        folder_color: formData.color, // For backward compatibility
        icon: formData.icon,
        is_smart: formData.isSmart,
        ai_criteria: aiCriteria,
        document_count: 0,
        ...((!initialData?.id) && { order_index: nextOrderIndex })
      };

      let data, error;

      if (initialData?.id) {
        // Update existing folder
        const result = await supabase
          .from('smart_folders')
          .update(folderData)
          .eq('id', initialData.id)
          .select();
        data = result.data;
        error = result.error;
      } else {
        // Create new folder
        const result = await supabase
          .from('smart_folders')
          .insert(folderData)
          .select();
        data = result.data;
        error = result.error;
      }

      if (error) {
        throw error;
      }

      toast({
        title: initialData ? "Folder Updated" : "Folder Created",
        description: `${formData.name} has been ${initialData ? 'updated' : 'created'} successfully`,
      });

      // If it's a smart folder and newly created, trigger organization of existing documents
      if (formData.isSmart && data && data[0] && !initialData) {
        try {
          toast({
            title: "Organizing Documents",
            description: "AI is matching existing documents to your smart folder criteria...",
          });

          const organizeResponse = await fetch(`${API_BASE_URL}/api/v1/organize-existing-documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: data[0].id })
          });

          if (organizeResponse.ok) {
            const organizeResult = await organizeResponse.json() as { documentsAdded?: number };
            if (organizeResult.documentsAdded && organizeResult.documentsAdded > 0) {
              toast({
                title: "Smart Folder Active! ✨",
                description: `Organized ${organizeResult.documentsAdded} existing documents into "${formData.name}"`,
              });
            } else {
              toast({
                title: "Smart Folder Created",
                description: `No existing documents matched the criteria. New documents will be organized automatically.`,
              });
            }
          } else {
            const errorData = await organizeResponse.json().catch(() => ({})) as { detail?: string };
            // eslint-disable-next-line no-console
            console.warn('Failed to organize existing documents:', errorData);
            toast({
              title: "Smart Folder Created",
              description: "Folder created. Organization of existing documents will happen when you upload new files.",
            });
          }
        } catch (error) {
          console.warn('Failed to organize existing documents:', error);
          toast({
            title: "Smart Folder Created",
            description: "Folder created but organization of existing documents failed",
            variant: "destructive",
          });
        }
      }

      onFolderCreated();
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        color: '#2563eb',
        icon: 'Folder',
        isSmart: false,
        smartCriteria: {
          contentTypes: [],
          importanceScore: 0,
          daysOld: 0,
          keywords: []
        }
      });

    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create folder",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.smartCriteria.keywords.includes(keywordInput.trim())) {
      setFormData(prev => ({
        ...prev,
        smartCriteria: {
          ...prev.smartCriteria,
          keywords: [...prev.smartCriteria.keywords, keywordInput.trim()]
        }
      }));
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      smartCriteria: {
        ...prev.smartCriteria,
        keywords: prev.smartCriteria.keywords.filter(k => k !== keyword)
      }
    }));
  };

  const toggleContentType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      smartCriteria: {
        ...prev.smartCriteria,
        contentTypes: prev.smartCriteria.contentTypes.includes(type)
          ? prev.smartCriteria.contentTypes.filter(t => t !== type)
          : [...prev.smartCriteria.contentTypes, type]
      }
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Folder' : 'Create New Folder'}</DialogTitle>
          <DialogDescription>
            {initialData 
              ? 'Update folder settings and organization rules'
              : 'Create a regular folder or an AI-powered smart folder that automatically organizes documents.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Folder Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter folder name"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Icon</Label>
                <Select value={formData.icon} onValueChange={(value) => setFormData(prev => ({ ...prev, icon: value }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {iconOptions.map(option => {
                      const IconComponent = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <IconComponent className="w-4 h-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Color</Label>
                <div className="grid grid-cols-5 gap-2 mt-1">
                  {colorOptions.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 ${
                        formData.color === color ? 'border-primary' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Smart Folder Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Smart Folder</div>
              <div className="text-sm text-muted-foreground">
                Automatically organize documents using AI criteria
              </div>
            </div>
            <Switch
              checked={formData.isSmart}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isSmart: checked }))}
            />
          </div>

          {/* Smart Criteria */}
          {formData.isSmart && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium">AI Organization Criteria</h4>
              
              {/* Content Types */}
              <div>
                <Label>Document Types</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {contentTypeOptions.map(type => (
                    <Badge
                      key={type}
                      variant={formData.smartCriteria.contentTypes.includes(type) ? "default" : "outline"}
                      className="cursor-pointer justify-center py-2"
                      onClick={() => toggleContentType(type)}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Importance Score */}
              <div>
                <Label>Minimum Importance Score (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.smartCriteria.importanceScore}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    smartCriteria: {
                      ...prev.smartCriteria,
                      importanceScore: parseInt(e.target.value) || 0
                    }
                  }))}
                  placeholder="0"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Documents with AI importance score above this threshold
                </p>
              </div>

              {/* Days Old */}
              <div>
                <Label>Maximum Age (Days)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.smartCriteria.daysOld}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    smartCriteria: {
                      ...prev.smartCriteria,
                      daysOld: parseInt(e.target.value) || 0
                    }
                  }))}
                  placeholder="0 (no limit)"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only include documents newer than this (0 = no limit)
                </p>
              </div>

              {/* Keywords */}
              <div>
                <Label>Keywords</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="Add keyword"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                  />
                  <Button type="button" variant="outline" onClick={addKeyword}>
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.smartCriteria.keywords.map(keyword => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeKeyword(keyword)}
                    >
                      {keyword} ×
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Documents containing these keywords in content or filename
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {initialData ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                initialData ? 'Update Folder' : 'Create Folder'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};