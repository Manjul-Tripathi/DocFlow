import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Bell,
  FileText,
  Tag,
  CalendarClock,
  CalendarDays,
  RotateCcw,
  Settings,
  Filter,
  ChevronRight,
  Eye,
  Hourglass
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useComplianceLabels } from '@/hooks/useComplianceLabels';
import { COMPLIANCE_FRAMEWORKS } from '@/types/compliance';
import { toast } from 'sonner';
import { format, differenceInDays, addDays, isPast, isWithinInterval } from 'date-fns';

interface LabelReview {
  id: string;
  document_id: string;
  document_name: string;
  label_id: string;
  label_name: string;
  label_color: string;
  applied_at: string;
  review_due: string;
  expires_at?: string;
  status: 'pending' | 'due_soon' | 'overdue' | 'completed';
  last_reviewed?: string;
  reviewed_by?: string;
  notes?: string;
}

interface ExpirationSetting {
  label_id: string;
  label_name: string;
  review_frequency_days: number;
  expiration_days?: number;
  auto_expire: boolean;
  reminder_days: number[];
  enabled: boolean;
}

export const ComplianceLabelExpiration: React.FC = () => {
  const { labels } = useComplianceLabels();
  const [reviews, setReviews] = useState<LabelReview[]>([]);
  const [expirationSettings, setExpirationSettings] = useState<ExpirationSetting[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState<ExpirationSetting | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<LabelReview | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Initialize mock data
  useEffect(() => {
    const now = new Date();
    
    // Mock reviews
    const mockReviews: LabelReview[] = [
      {
        id: '1',
        document_id: 'doc1',
        document_name: 'patient_records_2024.pdf',
        label_id: '2',
        label_name: 'HIPAA Protected',
        label_color: '#3B82F6',
        applied_at: addDays(now, -45).toISOString(),
        review_due: addDays(now, -5).toISOString(),
        expires_at: addDays(now, 15).toISOString(),
        status: 'overdue'
      },
      {
        id: '2',
        document_id: 'doc2',
        document_name: 'financial_statement_q4.xlsx',
        label_id: '4',
        label_name: 'SOX Audit Trail',
        label_color: '#8B5CF6',
        applied_at: addDays(now, -20).toISOString(),
        review_due: addDays(now, 10).toISOString(),
        status: 'due_soon'
      },
      {
        id: '3',
        document_id: 'doc3',
        document_name: 'customer_database.csv',
        label_id: '1',
        label_name: 'GDPR Compliant',
        label_color: '#10B981',
        applied_at: addDays(now, -60).toISOString(),
        review_due: addDays(now, 30).toISOString(),
        expires_at: addDays(now, 60).toISOString(),
        status: 'pending',
        last_reviewed: addDays(now, -30).toISOString(),
        reviewed_by: 'compliance@company.com'
      },
      {
        id: '4',
        document_id: 'doc4',
        document_name: 'payment_processing.pdf',
        label_id: '3',
        label_name: 'PCI-DSS Required',
        label_color: '#F59E0B',
        applied_at: addDays(now, -90).toISOString(),
        review_due: addDays(now, 5).toISOString(),
        status: 'due_soon'
      },
      {
        id: '5',
        document_id: 'doc5',
        document_name: 'employee_handbook.docx',
        label_id: '1',
        label_name: 'GDPR Compliant',
        label_color: '#10B981',
        applied_at: addDays(now, -10).toISOString(),
        review_due: addDays(now, 80).toISOString(),
        status: 'pending',
        last_reviewed: addDays(now, -10).toISOString(),
        reviewed_by: 'hr@company.com'
      }
    ];
    setReviews(mockReviews);

    // Mock expiration settings
    const mockSettings: ExpirationSetting[] = labels.map(label => ({
      label_id: label.id,
      label_name: label.name,
      review_frequency_days: label.review_frequency_days || 90,
      expiration_days: 365,
      auto_expire: false,
      reminder_days: [30, 14, 7, 1],
      enabled: true
    }));
    setExpirationSettings(mockSettings);
  }, [labels]);

  const filteredReviews = reviews.filter(review => {
    if (filterStatus === 'all') return true;
    return review.status === filterStatus;
  });

  const overdueCount = reviews.filter(r => r.status === 'overdue').length;
  const dueSoonCount = reviews.filter(r => r.status === 'due_soon').length;
  const pendingCount = reviews.filter(r => r.status === 'pending').length;

  const handleReviewComplete = () => {
    if (!selectedReview) return;
    
    setReviews(prev => prev.map(r => 
      r.id === selectedReview.id
        ? {
            ...r,
            status: 'completed' as const,
            last_reviewed: new Date().toISOString(),
            reviewed_by: 'current_user@company.com',
            notes: reviewNotes,
            review_due: addDays(new Date(), 90).toISOString()
          }
        : r
    ));
    
    setIsReviewDialogOpen(false);
    setSelectedReview(null);
    setReviewNotes('');
    toast.success('Review completed successfully');
  };

  const handleUpdateSetting = (settingId: string, field: keyof ExpirationSetting, value: any) => {
    setExpirationSettings(prev => prev.map(s => 
      s.label_id === settingId ? { ...s, [field]: value } : s
    ));
  };

  const getDaysUntil = (dateStr: string) => {
    return differenceInDays(new Date(dateStr), new Date());
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>;
      case 'due_soon':
        return <Badge className="bg-yellow-500">Due Soon</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'completed':
        return <Badge className="bg-green-500 text-white">Completed</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Label Expiration & Reviews
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage compliance label reviews and expiration schedules
          </p>
        </div>
        <Button variant="outline" onClick={() => setIsSettingsDialogOpen(true)}>
          <Settings className="h-4 w-4 mr-2" />
          Expiration Settings
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">Overdue Reviews</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{dueSoonCount}</p>
                <p className="text-xs text-muted-foreground">Due Soon (14 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Hourglass className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending Reviews</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">{reviews.filter(r => r.status === 'completed').length}</p>
                <p className="text-xs text-muted-foreground">Completed This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Upcoming Reviews</CardTitle>
              <CardDescription>Documents requiring compliance label review</CardDescription>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="due_soon">Due Soon</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {filteredReviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No reviews found</h3>
                  <p className="text-muted-foreground">
                    All compliance reviews are up to date
                  </p>
                </div>
              ) : (
                filteredReviews
                  .sort((a, b) => new Date(a.review_due).getTime() - new Date(b.review_due).getTime())
                  .map((review) => {
                    const daysUntilReview = getDaysUntil(review.review_due);
                    const daysUntilExpiration = review.expires_at ? getDaysUntil(review.expires_at) : null;
                    
                    return (
                      <div
                        key={review.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          review.status === 'overdue' ? 'border-red-500/30 bg-red-500/5' :
                          review.status === 'due_soon' ? 'border-yellow-500/30 bg-yellow-500/5' :
                          'bg-card'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                            
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{review.document_name}</h4>
                                {getStatusBadge(review.status)}
                              </div>
                              
                              <div className="flex items-center gap-2 mb-2">
                                <Badge
                                  style={{ backgroundColor: review.label_color }}
                                  className="text-white text-xs"
                                >
                                  {review.label_name}
                                </Badge>
                              </div>
                              
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Review due: {format(new Date(review.review_due), 'MMM d, yyyy')}
                                  {daysUntilReview !== 0 && (
                                    <span className={
                                      daysUntilReview < 0 ? 'text-red-500 font-medium' :
                                      daysUntilReview <= 14 ? 'text-yellow-500 font-medium' :
                                      ''
                                    }>
                                      ({daysUntilReview < 0 ? `${Math.abs(daysUntilReview)} days overdue` : `${daysUntilReview} days`})
                                    </span>
                                  )}
                                </span>
                                
                                {daysUntilExpiration !== null && (
                                  <span className="flex items-center gap-1">
                                    <Hourglass className="h-3 w-3" />
                                    Expires: {format(new Date(review.expires_at!), 'MMM d, yyyy')}
                                    <span className={daysUntilExpiration <= 30 ? 'text-orange-500' : ''}>
                                      ({daysUntilExpiration} days)
                                    </span>
                                  </span>
                                )}
                                
                                {review.last_reviewed && (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Last reviewed: {format(new Date(review.last_reviewed), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedReview(review);
                              setIsReviewDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Review</DialogTitle>
            <DialogDescription>
              Review and confirm compliance label for this document
            </DialogDescription>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{selectedReview.document_name}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge
                    style={{ backgroundColor: selectedReview.label_color }}
                    className="text-white"
                  >
                    {selectedReview.label_name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Applied {format(new Date(selectedReview.applied_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Review Notes</Label>
                <textarea
                  className="w-full h-24 px-3 py-2 rounded-md border bg-background text-sm resize-none"
                  placeholder="Add notes about this review (optional)..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> Completing this review will reset the review timer. 
                  The next review will be due based on the label's review frequency.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReviewComplete}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Complete Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Expiration Settings</DialogTitle>
            <DialogDescription>
              Configure review frequency and expiration for each compliance label
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4 py-4">
              {expirationSettings.map((setting) => {
                const label = labels.find(l => l.id === setting.label_id);
                if (!label) return null;
                
                return (
                  <div
                    key={setting.label_id}
                    className="p-4 rounded-lg border"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="font-medium">{setting.label_name}</span>
                      </div>
                      <Switch
                        checked={setting.enabled}
                        onCheckedChange={(checked) => handleUpdateSetting(setting.label_id, 'enabled', checked)}
                      />
                    </div>

                    {setting.enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Review Frequency (days)</Label>
                          <Input
                            type="number"
                            value={setting.review_frequency_days}
                            onChange={(e) => handleUpdateSetting(setting.label_id, 'review_frequency_days', parseInt(e.target.value))}
                            min={1}
                            max={365}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Expiration (days)</Label>
                          <Input
                            type="number"
                            value={setting.expiration_days || ''}
                            onChange={(e) => handleUpdateSetting(setting.label_id, 'expiration_days', parseInt(e.target.value) || undefined)}
                            min={1}
                            placeholder="No expiration"
                          />
                        </div>

                        <div className="col-span-2 flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-sm">Auto-expire when overdue</span>
                          <Switch
                            checked={setting.auto_expire}
                            onCheckedChange={(checked) => handleUpdateSetting(setting.label_id, 'auto_expire', checked)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setIsSettingsDialogOpen(false);
              toast.success('Expiration settings saved');
            }}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
