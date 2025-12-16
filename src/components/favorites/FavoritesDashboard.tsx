import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Star,
  Search,
  Grid,
  List,
  FileText,
  Clock,
  Download,
  Eye,
  Share2,
  Trash2,
  StickyNote,
  Palette,
  Filter,
  SortAsc,
  StarOff,
  Sparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useFavorites } from '@/hooks/useFavorites';
import { StarButton } from './StarButton';
import { FavoriteNotesDialog } from './FavoriteNotesDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  storage_url?: string | null;
}

interface FavoritesDashboardProps {
  documents: Document[];
  onViewDocument?: (documentId: string) => void;
  onDownloadDocument?: (documentId: string) => void;
}

const STAR_COLORS = [
  { value: 'yellow', label: 'Yellow', class: 'text-yellow-500' },
  { value: 'red', label: 'Red', class: 'text-red-500' },
  { value: 'blue', label: 'Blue', class: 'text-blue-500' },
  { value: 'green', label: 'Green', class: 'text-green-500' },
  { value: 'purple', label: 'Purple', class: 'text-purple-500' },
  { value: 'orange', label: 'Orange', class: 'text-orange-500' },
];

const getStarColorClass = (color: string) => {
  const found = STAR_COLORS.find(c => c.value === color);
  return found?.class || 'text-yellow-500';
};

export const FavoritesDashboard: React.FC<FavoritesDashboardProps> = ({
  documents,
  onViewDocument,
  onDownloadDocument,
}) => {
  const { favorites, loading, removeFavorite, updateFavoriteColor, isFavorite } = useFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'color'>('recent');
  const [filterColor, setFilterColor] = useState<string>('all');
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Combine favorites with document data
  const favoriteDocuments = useMemo(() => {
    const docMap = new Map(documents.map(d => [d.id, d]));
    
    return favorites
      .map(fav => ({
        ...fav,
        document: docMap.get(fav.document_id),
      }))
      .filter(fav => fav.document) // Only show favorites with existing documents
      .filter(fav => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          fav.document?.file_name.toLowerCase().includes(query) ||
          fav.notes?.toLowerCase().includes(query)
        );
      })
      .filter(fav => filterColor === 'all' || fav.color === filterColor)
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return (a.document?.file_name || '').localeCompare(b.document?.file_name || '');
          case 'color':
            return a.color.localeCompare(b.color);
          case 'recent':
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
  }, [favorites, documents, searchQuery, sortBy, filterColor]);

  const stats = useMemo(() => ({
    total: favorites.length,
    byColor: STAR_COLORS.reduce((acc, color) => {
      acc[color.value] = favorites.filter(f => f.color === color.value).length;
      return acc;
    }, {} as Record<string, number>),
    withNotes: favorites.filter(f => f.notes).length,
  }), [favorites]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleOpenNotes = (documentId: string) => {
    setSelectedDocumentId(documentId);
    setNotesDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading favorites...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <Star className="w-6 h-6 text-yellow-500" fill="currentColor" />
          </div>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              Starred Documents
              <Sparkles className="w-5 h-5 text-primary" />
            </h2>
            <p className="text-muted-foreground">Quick access to your important documents</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" fill="currentColor" />
              <span className="text-sm text-muted-foreground">Total Starred</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        {STAR_COLORS.slice(0, 4).map(color => (
          <Card key={color.value} className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setFilterColor(filterColor === color.value ? 'all' : color.value)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Star className={`w-4 h-4 ${color.class}`} fill="currentColor" />
                <span className="text-sm text-muted-foreground">{color.label}</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.byColor[color.value] || 0}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">With Notes</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.withNotes}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search starred documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterColor} onValueChange={setFilterColor}>
            <SelectTrigger className="w-[130px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Colors</SelectItem>
              {STAR_COLORS.map(color => (
                <SelectItem key={color.value} value={color.value}>
                  <div className="flex items-center gap-2">
                    <Star className={`w-3 h-3 ${color.class}`} fill="currentColor" />
                    {color.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-[130px]">
              <SortAsc className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="color">Color</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {favoriteDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <StarOff className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery || filterColor !== 'all' 
                ? 'No matching favorites' 
                : 'No starred documents yet'}
            </h3>
            <p className="text-muted-foreground max-w-md">
              {searchQuery || filterColor !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Star important documents to access them quickly. Click the star icon on any document to add it to your favorites.'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {favoriteDocuments.map(fav => (
            <Card 
              key={fav.id}
              className="group hover:shadow-lg transition-all duration-200 border hover:border-primary/20"
            >
              <CardContent className="p-4">
                {/* Header with Star */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-8 h-8 text-blue-500" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Star 
                            className={`w-5 h-5 ${getStarColorClass(fav.color)} cursor-pointer hover:scale-110 transition-transform`} 
                            fill="currentColor" 
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {STAR_COLORS.map(color => (
                          <DropdownMenuItem 
                            key={color.value}
                            onClick={() => updateFavoriteColor(fav.document_id, color.value)}
                          >
                            <Star className={`w-4 h-4 mr-2 ${color.class}`} fill="currentColor" />
                            {color.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDistanceToNow(new Date(fav.created_at), { addSuffix: true })}
                  </Badge>
                </div>

                {/* Title */}
                <h3 className="font-medium text-sm truncate mb-2">
                  {fav.document?.file_name}
                </h3>

                {/* Notes Preview */}
                {fav.notes && (
                  <div className="bg-muted/50 rounded-md p-2 mb-3">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      <StickyNote className="w-3 h-3 inline mr-1" />
                      {fav.notes}
                    </p>
                  </div>
                )}

                {/* Meta Info */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <span>{fav.document?.file_type?.toUpperCase()}</span>
                  <span>{formatFileSize(fav.document?.file_size || 0)}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pt-3 border-t">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onViewDocument?.(fav.document_id)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onDownloadDocument?.(fav.document_id)}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleOpenNotes(fav.document_id)}
                  >
                    <StickyNote className="w-3 h-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => removeFavorite(fav.document_id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {favoriteDocuments.map(fav => (
            <Card 
              key={fav.id}
              className="hover:shadow-md transition-all duration-200 border hover:border-primary/20"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Icon & Star */}
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Star 
                            className={`w-5 h-5 ${getStarColorClass(fav.color)} cursor-pointer hover:scale-110 transition-transform`} 
                            fill="currentColor" 
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {STAR_COLORS.map(color => (
                          <DropdownMenuItem 
                            key={color.value}
                            onClick={() => updateFavoriteColor(fav.document_id, color.value)}
                          >
                            <Star className={`w-4 h-4 mr-2 ${color.class}`} fill="currentColor" />
                            {color.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Document Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{fav.document?.file_name}</h3>
                    {fav.notes && (
                      <p className="text-sm text-muted-foreground truncate">
                        <StickyNote className="w-3 h-3 inline mr-1" />
                        {fav.notes}
                      </p>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{fav.document?.file_type?.toUpperCase()}</span>
                    <span>{formatFileSize(fav.document?.file_size || 0)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(fav.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onViewDocument?.(fav.document_id)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDownloadDocument?.(fav.document_id)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenNotes(fav.document_id)}>
                      <StickyNote className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => removeFavorite(fav.document_id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Notes Dialog */}
      {selectedDocumentId && (
        <FavoriteNotesDialog
          open={notesDialogOpen}
          onOpenChange={setNotesDialogOpen}
          documentId={selectedDocumentId}
          documentName={documents.find(d => d.id === selectedDocumentId)?.file_name || ''}
        />
      )}
    </div>
  );
};
