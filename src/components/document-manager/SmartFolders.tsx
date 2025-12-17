import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  Folder, 
  FolderOpen, 
  Plus, 
  Brain, 
  Star, 
  Clock, 
  FileText,
  Briefcase,
  Receipt,
  Award,
  User,
  MoreHorizontal,
  Settings,
  Sparkles,
  Trash2,
  Image,
  Video,
  Music,
  File,
  ChevronUp,
  ChevronDown,
  Loader2,
  Edit2,
  X
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreateFolderModal } from './CreateFolderModal';
import { CustomizeRulesModal } from './CustomizeRulesModal';
import { API_BASE_URL } from "@/config/api";

interface SmartFolder {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  is_smart: boolean;
  document_count: number;
  ai_criteria: any;
  order_index: number;
}

interface SmartFoldersProps {
  onFolderSelect: (folderId: string) => void;
  selectedFolder: string;
}

const iconMap: { [key: string]: React.ReactNode } = {
  'Folder': <Folder className="w-4 h-4" />,
  'Briefcase': <Briefcase className="w-4 h-4" />,
  'Receipt': <Receipt className="w-4 h-4" />,
  'Award': <Award className="w-4 h-4" />,
  'User': <User className="w-4 h-4" />,
  'FileText': <FileText className="w-4 h-4" />,
  'Star': <Star className="w-4 h-4" />,
  'Clock': <Clock className="w-4 h-4" />,
};

export const SmartFolders: React.FC<SmartFoldersProps> = ({
  onFolderSelect,
  selectedFolder
}) => {
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<SmartFolder | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSmartFolders();
    
    // Set up interval to refresh folder counts every 3 seconds when component is mounted
    const interval = setInterval(() => {
      fetchSmartFolders();
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchSmartFolders = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('smart_folders')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: true });

      if (error) {
        // If table doesn't exist, just set empty folders
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setFolders([]);
          return;
        }
        console.error('Error fetching folders:', error);
        return;
      }

      // Fetch actual document counts from document_shortcuts
      const folderIds = data?.map(f => f.id) || [];
      const { data: shortcuts } = await supabase
        .from('document_shortcuts')
        .select('folder_id')
        .in('folder_id', folderIds);

      // Count documents per folder
      const countsByFolder: { [key: string]: number } = {};
      shortcuts?.forEach(shortcut => {
        countsByFolder[shortcut.folder_id] = (countsByFolder[shortcut.folder_id] || 0) + 1;
      });

      // Update folders with actual counts
      const foldersWithCounts = data?.map(folder => ({
        ...folder,
        document_count: countsByFolder[folder.id] || 0
      })) || [];

      setFolders(foldersWithCounts);
    } catch (error) {
      console.error('Error:', error);
      // Don't show error toast if table doesn't exist yet
      if (error instanceof Error && !error.message?.includes('does not exist')) {
        toast({
          title: "Error",
          description: "Failed to load smart folders",
          variant: "destructive",
        });
      }
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const moveFolderUp = async (folderId: string) => {
    const folderIndex = folders.findIndex(f => f.id === folderId);
    if (folderIndex <= 0) return; // Can't move up if it's already first

    const currentFolder = folders[folderIndex];
    const previousFolder = folders[folderIndex - 1];

    try {
      // Swap order_index values
      await Promise.all([
        supabase
          .from('smart_folders')
          .update({ order_index: previousFolder.order_index })
          .eq('id', currentFolder.id),
        supabase
          .from('smart_folders')
          .update({ order_index: currentFolder.order_index })
          .eq('id', previousFolder.id)
      ]);

      // Refresh folders list
      fetchSmartFolders();
      
      toast({
        title: "Folder moved",
        description: `${currentFolder.name} moved up`,
      });
    } catch (error) {
      console.error('Error moving folder up:', error);
      toast({
        title: "Error",
        description: "Failed to move folder up",
        variant: "destructive",
      });
    }
  };

  const moveFolderDown = async (folderId: string) => {
    const folderIndex = folders.findIndex(f => f.id === folderId);
    if (folderIndex >= folders.length - 1) return; // Can't move down if it's already last

    const currentFolder = folders[folderIndex];
    const nextFolder = folders[folderIndex + 1];

    try {
      // Swap order_index values
      await Promise.all([
        supabase
          .from('smart_folders')
          .update({ order_index: nextFolder.order_index })
          .eq('id', currentFolder.id),
        supabase
          .from('smart_folders')
          .update({ order_index: currentFolder.order_index })
          .eq('id', nextFolder.id)
      ]);

      // Refresh folders list
      fetchSmartFolders();
      
      toast({
        title: "Folder moved",
        description: `${currentFolder.name} moved down`,
      });
    } catch (error) {
      console.error('Error moving folder down:', error);
      toast({
        title: "Error",
        description: "Failed to move folder down",
        variant: "destructive",
      });
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return;

      // Delete from database
      const { error } = await supabase
        .from('smart_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      toast({
        title: "Folder Deleted",
        description: `${folder.name} has been deleted`,
      });

      // If the deleted folder was selected, switch to 'all'
      if (selectedFolder === folderId) {
        onFolderSelect('all');
      }

      // Refresh folders list
      fetchSmartFolders();
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast({
        title: "Error",
        description: "Failed to delete folder",
        variant: "destructive",
      });
    }
  };

  const [isOrganizing, setIsOrganizing] = useState(false);

  const createSmartFoldersFromDocuments = async () => {
    try {
      setIsOrganizing(true);
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Error",
          description: "Please log in to organize documents",
          variant: "destructive",
        });
        return;
      }

      // Call the backend API to auto-organize documents
      const response = await fetch(`${API_BASE_URL}/api/v1/auto-organize-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.user.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || 'Failed to organize documents');
      }

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Smart Folders Created",
          description: result.message || `Organized ${result.documentsOrganized} documents into ${result.foldersCreated?.length || 0} folders`,
        });
        
        // Refresh folders list
        fetchSmartFolders();
      } else {
        throw new Error(result.message || 'Organization failed');
      }

    } catch (error) {
      console.error('Error organizing documents:', error);
      toast({
        title: "Organization Failed",
        description: error instanceof Error ? error.message : "Failed to organize documents",
        variant: "destructive",
      });
    } finally {
      setIsOrganizing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Smart Folders
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      // All Documents
      <Button
        variant={selectedFolder === 'all' ? 'default' : 'ghost'}
        className="w-full justify-start h-auto p-3"
        onClick={() => onFolderSelect('all')}
      >
        <div className="flex items-center gap-3">
          <div className="p-1 bg-blue-100 dark:bg-blue-900 rounded">
            <Folder className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="font-medium">All Documents</div>
            <div className="text-xs text-muted-foreground">View all documents</div>
          </div>
        </div>
      </Button>

      {/* Browse Files by Media */}
      <Button
        variant={selectedFolder === 'media-browser' ? 'default' : 'ghost'}
        className="w-full justify-start h-auto p-3"
        onClick={() => onFolderSelect('media-browser')}
      >
        <div className="flex items-center gap-3">
          <div className="p-1 bg-purple-100 dark:bg-purple-900 rounded">
            <Image className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-left">
            <div className="font-medium">Browse Files by Media</div>
            <div className="text-xs text-muted-foreground">Filter by file type</div>
          </div>
        </div>
      </Button>

      {folders.length === 0 ? (
        <Card className="p-4 text-center border-dashed">
          <div className="space-y-3">
            <Sparkles className="w-8 h-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium">No Smart Folders Yet</p>
              <p className="text-sm text-muted-foreground">
                Let AI organize your documents automatically
              </p>
            </div>
            <Button onClick={createSmartFoldersFromDocuments} size="sm" disabled={isOrganizing}>
              {isOrganizing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Organizing...
                </>
              ) : (
                'Create Smart Folders'
              )}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {folders.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-2 w-full">
              <div className="flex flex-col gap-1 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-primary/10"
                  onClick={() => moveFolderUp(folder.id)}
                  disabled={index === 0}
                  title="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-primary/10"
                  onClick={() => moveFolderDown(folder.id)}
                  disabled={index === folders.length - 1}
                  title="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              <Button
                variant={selectedFolder === folder.id ? 'default' : 'ghost'}
                className="justify-start h-auto p-3 flex-1 min-w-0"
                onClick={() => onFolderSelect(folder.id)}
              >
                <div className="flex items-center gap-2 w-full min-w-0">
                  <div 
                    className="p-1 rounded flex-shrink-0"
                    style={{ 
                      backgroundColor: `${folder.color}20`,
                      color: folder.color 
                    }}
                  >
                    {iconMap[folder.icon] || <Folder className="w-4 h-4" />}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1">
                      <span className="truncate">{folder.name}</span>
                      {folder.is_smart && (
                        <Brain className="w-3 h-3 text-primary flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {folder.document_count} documents
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {folder.document_count}
                  </Badge>
                </div>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 flex-shrink-0"
                    onClick={(e: any) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e: any) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onClick={(e: any) => {
                      e.stopPropagation();
                      setEditingFolder(folder);
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e: any) => {
                      e.stopPropagation();
                      setDeleteConfirmId(folder.id);
                    }}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Recycle Bin */}
      <Button
        variant={selectedFolder === 'recycle-bin' ? 'default' : 'ghost'}
        className="w-full justify-start h-auto p-3"
        onClick={() => {
          console.log('🗑️ Recycle Bin clicked! Calling onFolderSelect...');
          onFolderSelect('recycle-bin');
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-1 bg-red-100 dark:bg-red-900 rounded">
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-left">
            <div className="font-medium">Recycle Bin</div>
            <div className="text-xs text-muted-foreground">Deleted documents</div>
          </div>
        </div>
      </Button>

      {/* AI Organization Status */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium">AI Organization</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Documents are automatically organized based on content, type, and importance.
          </p>
          <div className="space-y-2">
            <Button 
              variant="default" 
              size="sm" 
              className="w-full" 
              onClick={createSmartFoldersFromDocuments}
              disabled={isOrganizing}
            >
              {isOrganizing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Organizing...
                </>
              ) : (
                <>
                  <Brain className="w-3 h-3 mr-1" />
                  Auto-Organize Documents
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCustomizeModal(true)}>
              <Settings className="w-3 h-3 mr-1" />
              Customize Rules
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onFolderCreated={fetchSmartFolders}
      />

      {/* Edit Folder Modal */}
      {editingFolder && (
        <CreateFolderModal
          isOpen={true}
          onClose={() => setEditingFolder(null)}
          onFolderCreated={fetchSmartFolders}
          initialData={editingFolder}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-background p-6 rounded-lg shadow-lg max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Delete Folder?</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete "{folders.find(f => f.id === deleteConfirmId)?.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => deleteFolder(deleteConfirmId)}>
                Delete Folder
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Customize Rules Modal */}
      <CustomizeRulesModal
        isOpen={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
      />
    </div>
  );
};