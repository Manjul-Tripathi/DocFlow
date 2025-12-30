import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  Search,
  Shield,
  Eye,
  Trash2,
  Calendar,
  User,
  ExternalLink,
  Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ComplianceFramework, COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

interface LabeledDocument {
  id: string;
  document_id: string;
  label_id: string;
  applied_at: string;
  applied_by: string;
  status: string;
  justification: string;
  next_review_date: string;
  document: {
    id: string;
    file_name: string;
    file_type: string;
    created_at: string;
  };
  label: {
    id: string;
    name: string;
    code: string;
    color: string;
    framework: ComplianceFramework;
  };
}

interface LabeledDocumentsListProps {
  filterFramework?: ComplianceFramework | 'all';
  filterLabelId?: string;
  onDocumentClick?: (documentId: string) => void;
}

export const LabeledDocumentsList: React.FC<LabeledDocumentsListProps> = ({
  filterFramework = 'all',
  filterLabelId,
  onDocumentClick
}) => {
  const [documents, setDocuments] = useState<LabeledDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFramework, setSelectedFramework] = useState<ComplianceFramework | 'all'>(filterFramework);
  const [selectedDocument, setSelectedDocument] = useState<LabeledDocument | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    fetchLabeledDocuments();
  }, [selectedFramework, filterLabelId]);

  useEffect(() => {
    setSelectedFramework(filterFramework);
  }, [filterFramework]);

  const fetchLabeledDocuments = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('document_compliance_labels')
        .select(`
          id,
          document_id,
          label_id,
          applied_at,
          applied_by,
          status,
          justification,
          next_review_date,
          documents!inner(id, file_name, file_type, created_at),
          compliance_labels!inner(id, name, code, color, framework)
        `)
        .eq('status', 'active')
        .order('applied_at', { ascending: false });

      if (selectedFramework !== 'all') {
        query = query.eq('compliance_labels.framework', selectedFramework);
      }

      if (filterLabelId) {
        query = query.eq('label_id', filterLabelId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedDocs = (data || []).map((item: any) => ({
        id: item.id,
        document_id: item.document_id,
        label_id: item.label_id,
        applied_at: item.applied_at,
        applied_by: item.applied_by,
        status: item.status,
        justification: item.justification,
        next_review_date: item.next_review_date,
        document: item.documents,
        label: item.compliance_labels
      }));

      setDocuments(formattedDocs);
    } catch (error) {
      console.error('Error fetching labeled documents:', error);
      toast.error('Failed to fetch labeled documents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveLabel = async (docLabelId: string) => {
    try {
      const { error } = await supabase
        .from('document_compliance_labels')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', docLabelId);

      if (error) throw error;

      toast.success('Label removed from document');
      fetchLabeledDocuments();
    } catch (error) {
      console.error('Error removing label:', error);
      toast.error('Failed to remove label');
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = 
      doc.document.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.label.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.label.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'pending_review':
        return <Badge className="bg-yellow-500">Pending Review</Badge>;
      case 'expired':
        return <Badge className="bg-red-500">Expired</Badge>;
      case 'revoked':
        return <Badge variant="outline">Revoked</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Labeled Documents
        </CardTitle>
        <CardDescription>
          View all documents with compliance labels applied
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents or labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={selectedFramework}
            onValueChange={(value) => setSelectedFramework(value as ComplianceFramework | 'all')}
          >
            <SelectTrigger className="w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by framework" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frameworks</SelectItem>
              {Object.entries(COMPLIANCE_FRAMEWORKS).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchLabeledDocuments}>
            Refresh
          </Button>
        </div>

        {/* Results count */}
        <div className="text-sm text-muted-foreground mb-4">
          Showing {filteredDocuments.length} labeled document{filteredDocuments.length !== 1 ? 's' : ''}
          {selectedFramework !== 'all' && ` for ${COMPLIANCE_FRAMEWORKS[selectedFramework]?.name}`}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No labeled documents found</p>
            <p className="text-sm">Apply compliance labels to documents to see them here</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Framework</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Review</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium truncate max-w-[200px]">
                            {doc.document.file_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.document.file_type}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: doc.label.color }}
                        />
                        <span className="font-medium">{doc.label.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.label.code}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={COMPLIANCE_FRAMEWORKS[doc.label.framework]?.color}
                      >
                        {doc.label.framework.replace('_', '-')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDistanceToNow(new Date(doc.applied_at), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(doc.status)}
                    </TableCell>
                    <TableCell>
                      {doc.next_review_date ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(doc.next_review_date), 'MMM d, yyyy')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedDocument(doc);
                            setShowDetailsDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDocumentClick?.(doc.document_id)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveLabel(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Label Details</DialogTitle>
            <DialogDescription>
              Compliance label information for this document
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{selectedDocument.document.file_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedDocument.document.file_type}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Label</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: selectedDocument.label.color }}
                    />
                    <span className="font-medium">{selectedDocument.label.name}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Framework</p>
                  <p className="font-medium mt-1">
                    {COMPLIANCE_FRAMEWORKS[selectedDocument.label.framework]?.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Applied</p>
                  <p className="font-medium mt-1">
                    {format(new Date(selectedDocument.applied_at), 'PPpp')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">
                    {getStatusBadge(selectedDocument.status)}
                  </div>
                </div>
              </div>

              {selectedDocument.justification && (
                <div>
                  <p className="text-sm text-muted-foreground">Justification</p>
                  <p className="mt-1 p-3 rounded-lg bg-muted/50">
                    {selectedDocument.justification}
                  </p>
                </div>
              )}

              {selectedDocument.next_review_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Next Review Date</p>
                  <p className="font-medium mt-1">
                    {format(new Date(selectedDocument.next_review_date), 'PPP')}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
