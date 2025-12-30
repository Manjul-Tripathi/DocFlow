import React, { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Trash2, Users, Calendar, Mail, User,
  ArrowUp, ArrowDown, AlertCircle, Upload, FileText, X
} from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useElectronicSignatures } from '@/hooks/useElectronicSignatures';
import type { SignerRole } from '@/types/signature';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface CreateSignatureRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SignerInput {
  id: string;
  name: string;
  email: string;
  role: SignerRole;
}

export const CreateSignatureRequestDialog: React.FC<CreateSignatureRequestDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { createRequest, sendRequest } = useElectronicSignatures();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'details' | 'recipients'>('details');

  // Form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSequential, setIsSequential] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const [signers, setSigners] = useState<SignerInput[]>([
    { id: '1', name: '', email: '', role: 'signer' },
  ]);

  const addSigner = () => {
    setSigners([
      ...signers,
      { id: Date.now().toString(), name: '', email: '', role: 'signer' },
    ]);
  };

  const removeSigner = (id: string) => {
    if (signers.length > 1) {
      setSigners(signers.filter(s => s.id !== id));
    }
  };

  const updateSigner = (id: string, field: keyof SignerInput, value: string) => {
    setSigners(signers.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const moveSigner = (index: number, direction: 'up' | 'down') => {
    const newSigners = [...signers];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newSigners[index], newSigners[newIndex]] = [newSigners[newIndex], newSigners[index]];
    setSigners(newSigners);
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const canProceed = step === 'details'
    ? title.trim().length > 0
    : signers.every(s => s.name.trim() && isValidEmail(s.email));

  const handleSubmit = async (sendImmediately: boolean) => {
    if (!canProceed) return;

    setIsSubmitting(true);
    try {
      // Upload document file to storage if provided
      let documentUrl: string | undefined = undefined;

      if (documentFile) {
        setIsUploading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Create safe filename - use user's folder directly (matches existing RLS policies)
        const timestamp = Date.now();
        const safeName = documentFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${user.id}/${timestamp}_sig_${safeName}`;

        console.log('📤 Uploading signature document to:', filePath);

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, documentFile, {
            contentType: documentFile.type,
            upsert: false
          });

        if (uploadError) {
          console.error('❌ Upload failed:', uploadError);
          throw new Error(`Failed to upload document: ${uploadError.message}`);
        }

        console.log('✅ Upload successful:', uploadData);

        // Store the storage path - backend will create signed URL when needed
        // Format: storage://bucket/path
        documentUrl = `storage://documents/${filePath}`;
        console.log('🔗 Document storage path:', documentUrl);
        setIsUploading(false);
      }

      const expiresAt = hasExpiry
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const request = await createRequest({
        title,
        message: message || undefined,
        document_name: documentName || documentFile?.name || undefined,
        document_url: documentUrl,
        signing_order: isSequential ? 'sequential' : 'parallel',
        expires_at: expiresAt,
        signers: signers.map((s, index) => ({
          name: s.name,
          email: s.email,
          role: s.role,
          signing_order: isSequential ? index : 0,
        })),
      });

      if (sendImmediately && request) {
        await sendRequest(request.id);
      }

      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Failed to create request:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create signature request',
        variant: 'destructive',
      });
      setIsUploading(false);
    } finally {
      setIsSubmitting(false);
    }
  };


  const resetForm = () => {
    setStep('details');
    setTitle('');
    setMessage('');
    setDocumentName('');
    setDocumentFile(null);
    setIsSequential(false);
    setHasExpiry(false);
    setExpiryDays(30);
    setSigners([{ id: '1', name: '', email: '', role: 'signer' }]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentFile(file);
      if (!documentName) {
        setDocumentName(file.name);
      }
    }
  };

  const removeDocument = () => {
    setDocumentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create Signature Request</DialogTitle>
          <DialogDescription>
            {step === 'details'
              ? 'Enter the details for your signature request'
              : 'Add recipients who need to sign this document'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {step === 'details' ? (
            <div className="space-y-4 p-1">
              <div>
                <Label>Request Title *</Label>
                <Input
                  placeholder="e.g., Employment Contract - John Smith"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <Label>Document Name</Label>
                <Input
                  placeholder="e.g., Contract_2024.pdf"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                />
              </div>

              <div>
                <Label>Upload Document</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {documentFile ? (
                  <div className="border rounded-lg p-4 flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{documentFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(documentFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={removeDocument}
                      className="text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">Click to upload document</p>
                    <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, or TXT up to 10MB</p>
                  </div>
                )}
              </div>

              <div>
                <Label>Message to Recipients</Label>
                <Textarea
                  placeholder="Please review and sign this document..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Sequential Signing
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Recipients sign one after another in order
                  </p>
                </div>
                <Switch checked={isSequential} onCheckedChange={setIsSequential} />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Set Expiration
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Request expires if not completed in time
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
                  {hasExpiry && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        value={expiryDays}
                        onChange={(e) => setExpiryDays(parseInt(e.target.value) || 1)}
                        className="w-16"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-1">
              {isSequential && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <p className="text-sm text-blue-600">
                    Recipients will sign in the order shown below
                  </p>
                </div>
              )}

              {signers.map((signer, index) => (
                <div
                  key={signer.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isSequential && (
                        <Badge variant="outline">{index + 1}</Badge>
                      )}
                      <span className="font-medium">Recipient {index + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isSequential && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => moveSigner(index, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => moveSigner(index, 'down')}
                            disabled={index === signers.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeSigner(signer.id)}
                        disabled={signers.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="flex items-center gap-1 text-xs">
                        <User className="h-3 w-3" />
                        Name
                      </Label>
                      <Input
                        placeholder="John Smith"
                        value={signer.name}
                        onChange={(e) => updateSigner(signer.id, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="flex items-center gap-1 text-xs">
                        <Mail className="h-3 w-3" />
                        Email
                      </Label>
                      <Input
                        type="email"
                        placeholder="john@example.com"
                        value={signer.email}
                        onChange={(e) => updateSigner(signer.id, 'email', e.target.value)}
                        className={cn(
                          signer.email && !isValidEmail(signer.email) && "border-red-500"
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Role</Label>
                    <Select
                      value={signer.role}
                      onValueChange={(v) => updateSigner(signer.id, 'role', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="signer">Signer - Must sign the document</SelectItem>
                        <SelectItem value="approver">Approver - Must approve before signing</SelectItem>
                        <SelectItem value="viewer">Viewer - Can view but not sign</SelectItem>
                        <SelectItem value="cc">CC - Receives a copy when completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}

              <Button variant="outline" onClick={addSigner} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Recipient
              </Button>
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          {step === 'recipients' && (
            <Button variant="outline" onClick={() => setStep('details')}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === 'details' ? (
            <Button onClick={() => setStep('recipients')} disabled={!canProceed}>
              Next: Add Recipients
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || !canProceed}
              >
                Save as Draft
              </Button>
              <Button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting || !canProceed}
              >
                Send for Signature
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
