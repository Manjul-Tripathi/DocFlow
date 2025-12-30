import React, { useState } from 'react';
import {
  PenTool, FileText, Clock, CheckCircle, XCircle, Send,
  Plus, RefreshCw, Users, Calendar, AlertTriangle, Download,
  Eye, MoreVertical, Trash2, Copy, Edit, Mail
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useElectronicSignatures } from '@/hooks/useElectronicSignatures';
import { CreateSignatureRequestDialog } from './CreateSignatureRequestDialog';
import { SignatureRequestDetail } from './SignatureRequestDetail';
import { SignaturePadDialog } from './SignaturePadDialog';
import { STATUS_CONFIG, SIGNER_STATUS_CONFIG } from '@/types/signature';
import type { SignatureRequest, SignatureRequestStatus } from '@/types/signature';
import { cn } from '@/lib/utils';

export const SignatureDashboard: React.FC = () => {
  const {
    requests,
    requestsToSign,
    receivedRequests,
    stats,
    isLoading,
    activeRequest,
    setActiveRequest,
    refresh,
    refreshToSign,
    refreshReceived,
    sendRequest,
    cancelRequest,
    signDocument,
  } = useElectronicSignatures();

  const [activeTab, setActiveTab] = useState<'all' | 'to_sign' | 'received' | 'pending' | 'completed' | 'drafts' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const filteredRequests = requests.filter(request => {
    const matchesSearch = request.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.signers?.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase()));

    switch (activeTab) {
      case 'pending': return matchesSearch && request.status === 'pending';
      case 'completed': return matchesSearch && request.status === 'completed';
      case 'drafts': return matchesSearch && request.status === 'draft';
      case 'cancelled': return matchesSearch && request.status === 'cancelled';
      default: return matchesSearch;
    }
  });

  const statCards = [
    {
      title: 'Total Requests',
      value: stats.total_requests,
      icon: FileText,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Pending',
      value: stats.pending,
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      alert: stats.pending > 0,
    },
    {
      title: 'Completed',
      value: stats.completed,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Awaiting My Signature',
      value: stats.awaiting_my_signature,
      icon: PenTool,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      alert: stats.awaiting_my_signature > 0,
    },
    {
      title: 'Completion Rate',
      value: `${stats.completion_rate}%`,
      icon: CheckCircle,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      isPercentage: true,
    },
    {
      title: 'Declined/Expired',
      value: stats.declined + stats.expired,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
  ];

  const getSignerProgress = (request: SignatureRequest) => {
    const signers = request.signers?.filter(s => s.role === 'signer' || s.role === 'approver') || [];
    const signed = signers.filter(s => s.status === 'signed').length;
    return { signed, total: signers.length, percentage: signers.length ? (signed / signers.length) * 100 : 0 };
  };

  if (activeRequest) {
    return (
      <SignatureRequestDetail
        request={activeRequest}
        onBack={() => setActiveRequest(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-6 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PenTool className="h-7 w-7 text-primary" />
              Electronic Signatures
            </h1>
            <p className="text-muted-foreground mt-1">
              Send, track, and sign documents securely
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { refresh(); refreshToSign(); refreshReceived(); }} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSignaturePad(true)}>
              <PenTool className="h-4 w-4 mr-2" />
              My Signatures
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6 border-b shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className={cn("relative overflow-hidden", stat.alert && "ring-2 ring-primary/50")}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                    <stat.icon className={cn("h-5 w-5", stat.color)} />
                  </div>
                  {stat.alert && (
                    <AlertTriangle className="h-4 w-4 text-primary animate-pulse" />
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  {stat.isPercentage && (
                    <Progress value={stats.completion_rate} className="h-1 mt-2" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col min-h-0">
        <div className="border-b px-6 shrink-0 flex items-center justify-between">
          <TabsList className="h-12">
            <TabsTrigger value="all" className="gap-2">
              <FileText className="h-4 w-4" />
              All
              <Badge variant="secondary">{requests.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="to_sign" className="gap-2">
              <PenTool className="h-4 w-4" />
              To Sign
              {requestsToSign.length > 0 && <Badge className="bg-purple-500">{requestsToSign.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="received" className="gap-2">
              <Mail className="h-4 w-4" />
              Received
              <Badge variant="secondary">{receivedRequests.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending
              {stats.pending > 0 && <Badge>{stats.pending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed
              <Badge variant="secondary">{stats.completed}</Badge>
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2">
              <Edit className="h-4 w-4" />
              Drafts
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-2">
              <XCircle className="h-4 w-4" />
              Cancelled
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 py-2">
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          <ScrollArea className="h-full">
            {/* Special content for 'to_sign' tab */}
            {activeTab === 'to_sign' ? (
              <div className="space-y-3">
                {requestsToSign.length > 0 ? (
                  <>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                        <PenTool className="h-5 w-5" />
                        Documents Awaiting Your Signature
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Click on a document below to review and sign
                      </p>
                    </div>
                    {requestsToSign.map((request) => (
                      <Card
                        key={request.id}
                        className="cursor-pointer hover:border-purple-500/50 transition-colors border-l-4 border-l-purple-500"
                        onClick={() => setActiveRequest(request)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-lg bg-purple-500/10">
                              <FileText className="h-6 w-6 text-purple-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">{request.title}</h3>
                                <Badge variant="outline" className="text-purple-500 border-purple-500">
                                  Awaiting Signature
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                {request.document_name && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    {request.document_name}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Received: {new Date(request.created_at).toLocaleDateString()}
                                </span>
                                {request.expires_at && (
                                  <span className="flex items-center gap-1 text-orange-500">
                                    <Clock className="h-3 w-3" />
                                    Expires: {new Date(request.expires_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              {request.message && (
                                <p className="text-sm text-muted-foreground mt-2 italic">
                                  "{request.message}"
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRequest(request);
                                }}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                <PenTool className="h-4 w-4 mr-2" />
                                Sign Now
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
                    <h3 className="text-lg font-medium mb-2">All caught up!</h3>
                    <p className="text-sm">You have no documents waiting for your signature</p>
                  </div>
                )}
              </div>
            ) : activeTab === 'received' ? (
              /* Received tab - shows all documents user received for signature */
              <div className="space-y-3">
                {receivedRequests.length > 0 ? (
                  <>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Documents Received for Signature
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Complete history of all signature requests sent to you
                      </p>
                    </div>
                    {receivedRequests.map((request) => {
                      const myInfo = (request as any).mySignerInfo;
                      const isSigned = myInfo?.signerStatus === 'signed';
                      return (
                        <Card
                          key={request.id}
                          className={cn(
                            "cursor-pointer hover:border-primary/50 transition-colors border-l-4",
                            isSigned ? "border-l-green-500" : "border-l-blue-500"
                          )}
                          onClick={() => setActiveRequest(request)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <div className={cn("p-3 rounded-lg", isSigned ? "bg-green-500/10" : "bg-blue-500/10")}>
                                <FileText className={cn("h-6 w-6", isSigned ? "text-green-500" : "text-blue-500")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold truncate">{request.title}</h3>
                                  <Badge
                                    variant="outline"
                                    className={isSigned ? "text-green-500 border-green-500" : "text-blue-500 border-blue-500"}
                                  >
                                    {isSigned ? 'Signed' : request.status === 'completed' ? 'Completed' : 'Pending'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  {request.document_name && (
                                    <span className="flex items-center gap-1">
                                      <FileText className="h-3 w-3" />
                                      {request.document_name}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Received: {new Date(request.created_at).toLocaleDateString()}
                                  </span>
                                  {myInfo?.signedAt && (
                                    <span className="flex items-center gap-1 text-green-600">
                                      <CheckCircle className="h-3 w-3" />
                                      Signed: {new Date(myInfo.signedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isSigned ? (
                                  <Badge className="bg-green-500">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Signed
                                  </Badge>
                                ) : (
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveRequest(request);
                                    }}
                                    size="sm"
                                    className="bg-purple-600 hover:bg-purple-700"
                                  >
                                    <PenTool className="h-4 w-4 mr-2" />
                                    Sign Now
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No documents received</h3>
                    <p className="text-sm">You haven't received any signature requests yet</p>
                  </div>
                )}
              </div>
            ) : (
              /* Regular content for other tabs */
              <div className="space-y-3">
                {filteredRequests.map((request) => {
                  const statusConfig = STATUS_CONFIG[request.status as SignatureRequestStatus];
                  const progress = getSignerProgress(request);

                  return (
                    <Card
                      key={request.id}
                      className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group"
                      onClick={() => setActiveRequest(request)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Status Icon */}
                          <div className={cn("p-2.5 rounded-lg shrink-0", statusConfig.bgColor)}>
                            <FileText className={cn("h-5 w-5", statusConfig.color)} />
                          </div>

                          {/* Request Info */}
                          <div className="flex-1 min-w-0">
                            {/* Title Row */}
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate text-base">{request.title}</h3>
                              <Badge variant="outline" className={cn("shrink-0 text-xs", statusConfig.color)}>
                                {statusConfig.label}
                              </Badge>
                            </div>

                            {/* Meta Info Row */}
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {request.document_name && (
                                <span className="flex items-center gap-1 truncate max-w-[150px]">
                                  <FileText className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{request.document_name}</span>
                                </span>
                              )}
                              <span className="flex items-center gap-1 shrink-0">
                                <Users className="h-3 w-3" />
                                {request.signers?.length || 0}
                              </span>
                              <span className="flex items-center gap-1 shrink-0">
                                <Calendar className="h-3 w-3" />
                                {new Date(request.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            {/* Progress Row - only for pending */}
                            {request.status === 'pending' && progress.total > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <Progress value={progress.percentage} className="h-1.5 flex-1 max-w-[200px]" />
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {progress.signed}/{progress.total}
                                </span>
                                {/* Compact Signer Avatars */}
                                <div className="flex items-center -space-x-1.5 ml-2">
                                  {request.signers?.slice(0, 4).map((signer) => (
                                    <div
                                      key={signer.id}
                                      className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium border-2 border-background",
                                        signer.status === 'signed' ? 'bg-green-500 text-white' :
                                          signer.status === 'declined' ? 'bg-red-500 text-white' :
                                            signer.status === 'viewed' ? 'bg-yellow-500 text-white' :
                                              'bg-muted text-muted-foreground'
                                      )}
                                      title={`${signer.name} - ${SIGNER_STATUS_CONFIG[signer.status].label}`}
                                    >
                                      {signer.name.charAt(0).toUpperCase()}
                                    </div>
                                  ))}
                                  {(request.signers?.length || 0) > 4 && (
                                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium border-2 border-background">
                                      +{(request.signers?.length || 0) - 4}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {request.status === 'draft' && (
                              <Button size="sm" onClick={() => sendRequest(request.id)}>
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Send
                              </Button>
                            )}
                            {request.status === 'completed' && (
                              <Button variant="outline" size="sm">
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setActiveRequest(request)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                {request.status === 'pending' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => cancelRequest(request.id)}
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Cancel Request
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {request.status === 'draft' && (
                                  <DropdownMenuItem className="text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {filteredRequests.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <PenTool className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No signature requests</h3>
                    <p className="text-sm mb-4">Create your first signature request to get started</p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Request
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </Tabs>

      {/* Dialogs */}
      <CreateSignatureRequestDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
      <SignaturePadDialog
        open={showSignaturePad}
        onOpenChange={setShowSignaturePad}
      />
    </div>
  );
};
