import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type {
  SignatureRequest,
  SignatureSigner,
  SignatureField,
  UserSignature,
  SignatureAuditLog,
  SignatureTemplate,
  SignatureStats,
  SignerRole,
  SignatureType,
} from '@/types/signature';

export const useElectronicSignatures = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [requestsToSign, setRequestsToSign] = useState<SignatureRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<SignatureRequest[]>([]);
  const [activeRequest, setActiveRequest] = useState<SignatureRequest | null>(null);
  const [userSignatures, setUserSignatures] = useState<UserSignature[]>([]);
  const [templates] = useState<SignatureTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SignatureStats>({
    total_requests: 0,
    pending: 0,
    completed: 0,
    declined: 0,
    expired: 0,
    awaiting_my_signature: 0,
    completion_rate: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      // Fetch requests
      const { data: requestData, error: requestError } = await supabase
        .from('signature_requests')
        .select(`
          *,
          signers:signature_signers(*)
        `)
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });

      if (requestError) throw requestError;

      const typedRequests = (requestData || []).map((r: any) => ({
        ...r,
        signers: r.signers.sort((a: any, b: any) => a.signing_order - b.signing_order)
      })) as SignatureRequest[];

      setRequests(typedRequests);

      // Fetch user signatures
      const { data: signaturesData, error: sigError } = await supabase
        .from('user_signatures')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });

      if (!sigError && signaturesData) {
        setUserSignatures(signaturesData as UserSignature[]);
      }

      // Calculate stats
      const total = typedRequests.length;
      const pending = typedRequests.filter(r => r.status === 'pending').length;
      const completed = typedRequests.filter(r => r.status === 'completed').length;
      const declined = typedRequests.filter(r => r.status === 'declined').length;
      const expired = typedRequests.filter(r => r.status === 'expired').length;

      setStats({
        total_requests: total,
        pending,
        completed,
        declined,
        expired,
        awaiting_my_signature: 0,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      });

    } catch (error) {
      console.error('Error fetching signatures:', error);
      toast({
        title: 'Error',
        description: 'Failed to load signature requests',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Initial fetch
  useEffect(() => {
    fetchData();
    fetchRequestsToSign();
    fetchReceivedRequests();
  }, [fetchData]);

  // Fetch ALL signature requests where current user is a signer (any status - for history)
  // EXCLUDES requests created by the current user (those show in All/Pending/Completed)
  const fetchReceivedRequests = useCallback(async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user?.email || !user.user?.id) return;

      // Find all signers with current user's email (any status)
      const { data: signerRecords, error: signerError } = await supabase
        .from('signature_signers')
        .select(`
          *,
          request:signature_requests(
            *,
            signers:signature_signers(*)
          )
        `)
        .eq('email', user.user.email);

      if (signerError) {
        console.error('Error fetching received requests:', signerError);
        return;
      }

      if (!signerRecords || signerRecords.length === 0) {
        setReceivedRequests([]);
        return;
      }

      // Extract unique requests with full signer info
      // IMPORTANT: Exclude requests where the current user is the owner/sender
      const allReceived = signerRecords
        .filter((s: any) => s.request && s.request.user_id !== user.user!.id)
        .map((s: any) => ({
          ...s.request,
          signers: s.request.signers?.sort((a: any, b: any) => a.signing_order - b.signing_order) || [],
          mySignerInfo: {
            signerId: s.id,
            signerStatus: s.status,
            signerRole: s.role,
            signedAt: s.signed_at,
          }
        })) as SignatureRequest[];

      // Remove duplicates by request id
      const uniqueReceived = allReceived.reduce((acc: SignatureRequest[], curr) => {
        if (!acc.find(r => r.id === curr.id)) {
          acc.push(curr);
        }
        return acc;
      }, []);

      // Sort by created_at descending
      uniqueReceived.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setReceivedRequests(uniqueReceived);
      console.log('📨 Received requests (from others):', uniqueReceived.length);

    } catch (error) {
      console.error('Error fetching received requests:', error);
    }
  }, []);
  // Fetch pending signature requests where current user is a signer (needs to sign)
  // EXCLUDES requests created by the current user
  const fetchRequestsToSign = useCallback(async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user?.email || !user.user?.id) return;

      // Find all signers with current user's email
      const { data: signerRecords, error: signerError } = await supabase
        .from('signature_signers')
        .select(`
          *,
          request:signature_requests(
            *,
            signers:signature_signers(*)
          )
        `)
        .eq('email', user.user.email)
        .in('status', ['pending', 'sent', 'viewed']);

      if (signerError) {
        console.error('Error fetching signers:', signerError);
        return;
      }

      if (!signerRecords || signerRecords.length === 0) {
        setRequestsToSign([]);
        return;
      }

      // Extract unique requests where user needs to sign
      // IMPORTANT: Exclude requests created by the current user
      const pendingRequests = signerRecords
        .filter((s: any) => s.request && s.request.status === 'pending' && s.request.user_id !== user.user!.id)
        .map((s: any) => ({
          ...s.request,
          signers: s.request.signers?.sort((a: any, b: any) => a.signing_order - b.signing_order) || [],
          currentSignerInfo: {
            signerId: s.id,
            signerStatus: s.status,
            signerRole: s.role,
          }
        })) as SignatureRequest[];

      // Remove duplicates by request id
      const uniqueRequests = pendingRequests.reduce((acc: SignatureRequest[], curr) => {
        if (!acc.find(r => r.id === curr.id)) {
          acc.push(curr);
        }
        return acc;
      }, []);

      setRequestsToSign(uniqueRequests);

      // Update stats with awaiting count
      setStats(prev => ({
        ...prev,
        awaiting_my_signature: uniqueRequests.length
      }));

    } catch (error) {
      console.error('Error fetching requests to sign:', error);
    }
  }, []);

  const createRequest = async (data: {
    title: string;
    message?: string;
    document_name?: string;
    document_url?: string;
    signing_order?: 'parallel' | 'sequential';
    expires_at?: string;
    signers: Array<{ name: string; email: string; role?: SignerRole; signing_order?: number }>;
  }) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // 1. Create Request
      const { data: newRequest, error: reqError } = await supabase
        .from('signature_requests')
        .insert({
          user_id: user.user.id,
          title: data.title,
          message: data.message,
          document_name: data.document_name,
          document_url: data.document_url,
          status: 'draft',
          signing_order: data.signing_order || 'parallel',
          expires_at: data.expires_at,
        })
        .select()
        .single();

      if (reqError) throw reqError;

      // 2. Create Signers
      if (data.signers.length > 0) {
        const signersToInsert = data.signers.map((s, i) => ({
          request_id: newRequest.id,
          name: s.name,
          email: s.email,
          role: s.role || 'signer',
          signing_order: s.signing_order ?? i,
          status: 'pending',
        }));

        const { error: signerError } = await supabase
          .from('signature_signers')
          .insert(signersToInsert);

        if (signerError) throw signerError;
      }

      toast({ title: 'Success', description: 'Signature request created' });
      fetchData(); // Refresh list
      return newRequest;

    } catch (error) {
      console.error('Error creating request:', error);
      toast({
        title: 'Error',
        description: 'Failed to create signature request',
        variant: 'destructive',
      });
      return null;
    }
  };

  const sendRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('signature_requests')
        .update({ status: 'pending' })
        .eq('id', requestId);

      if (error) throw error;

      // Send emails to all signers
      try {
        console.log('📧 Sending emails for request:', requestId);
        const response = await fetch('/api/signatures/send-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId }),
        });

        const data = await response.json();
        console.log('📧 Email API response:', data);

        if (response.ok) {
          console.log('✅ Emails sent successfully:', data);
        } else {
          console.error('❌ Email API error:', data);
        }
      } catch (emailError) {
        console.error('❌ Failed to send emails:', emailError);
        // Don't fail the whole operation if emails fail
      }

      toast({ title: 'Success', description: 'Signature request sent' });
      fetchData();
    } catch (error) {
      console.error('Error sending request:', error);
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const cancelRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('signature_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Request cancelled' });
      fetchData();
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast({ title: 'Error', description: 'Failed to cancel request', variant: 'destructive' });
    }
  };

  const saveUserSignature = async (data: {
    signature_type: SignatureType;
    name: string;
    data_url: string;
    font_family?: string;
    is_default: boolean;
  }) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // If setting as default, unset other defaults of same type first
      if (data.is_default) {
        await supabase
          .from('user_signatures')
          .update({ is_default: false })
          .eq('user_id', user.user.id)
          .eq('signature_type', data.signature_type);
      }

      // Insert new signature
      const { error } = await supabase
        .from('user_signatures')
        .insert({
          user_id: user.user.id,
          signature_type: data.signature_type,
          name: data.name,
          data_url: data.data_url,
          font_family: data.font_family,
          is_default: data.is_default,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Signature saved successfully',
      });

      fetchData(); // Refresh to show new signature
    } catch (error) {
      console.error('Error saving signature:', error);
      toast({
        title: 'Error',
        description: 'Failed to save signature',
        variant: 'destructive',
      });
    }
  };

  const deleteUserSignature = async (id: string) => {
    try {
      const { error } = await supabase
        .from('user_signatures')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Signature deleted',
      });

      fetchData(); // Refresh
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete signature',
        variant: 'destructive',
      });
    }
  };

  const signDocument = async (
    requestId: string,
    signatureDataUrl: string,
    position?: { page: number; x: number; y: number; width: number; height: number; xPercent: number; yPercent: number }
  ) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('Not authenticated');

      // Find signer record for this user
      const { data: signer, error: signerError } = await supabase
        .from('signature_signers')
        .select('*')
        .eq('request_id', requestId)
        .eq('email', user.data.user.email)
        .single();

      if (signerError || !signer) {
        throw new Error('You are not a signer on this request');
      }

      // Check if it's this signer's turn (for sequential signing)
      try {
        const turnCheckResponse = await fetch('/api/signatures/check-signer-turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: requestId,
            signer_email: user.data.user.email
          }),
        });

        if (turnCheckResponse.ok) {
          const turnData = await turnCheckResponse.json();
          if (!turnData.can_sign) {
            toast({
              title: 'Please Wait',
              description: turnData.message || 'It is not your turn to sign yet.',
              variant: 'destructive'
            });
            return;
          }
        }
      } catch (turnError) {
        console.error('Error checking signer turn:', turnError);
        // Continue anyway - don't block signing due to check failure
      }

      console.log('📝 Signing document for signer:', signer.id, signer.email);
      if (position) {
        console.log('📍 Signature position:', position);
      }

      // Update signer with signature and position
      const updateData: Record<string, unknown> = {
        status: 'signed',
        signed_at: new Date().toISOString(),
        signature_data_url: signatureDataUrl,
      };

      // Add position if provided
      if (position) {
        updateData.signature_position = position;
      }

      const { error: updateError } = await supabase
        .from('signature_signers')
        .update(updateData)
        .eq('id', signer.id);

      if (updateError) throw updateError;

      console.log('✅ Signer status updated to signed');

      // Check if all signers have signed (fetch fresh data)
      const { data: allSigners, error: allSignersError } = await supabase
        .from('signature_signers')
        .select('id, email, status, role')
        .eq('request_id', requestId);

      console.log('📋 All signers for this request:', allSigners);

      if (allSignersError) {
        console.error('Error fetching signers:', allSignersError);
      }

      // Check signers who need to sign (signer or approver roles)
      const signersToCheck = allSigners?.filter(s => s.role === 'signer' || s.role === 'approver') || [];
      const allSigned = signersToCheck.length > 0 && signersToCheck.every(s => s.status === 'signed');

      console.log('🔍 Signers to check:', signersToCheck);
      console.log('✅ All signed?', allSigned);

      // If all signed, mark request as completed
      if (allSigned) {
        const { error: completeError } = await supabase
          .from('signature_requests')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', requestId);

        if (completeError) {
          console.error('Error completing request:', completeError);
        } else {
          console.log('🎉 Request marked as completed!');
        }

        toast({ title: 'Success', description: 'Document fully signed and completed!' });
      } else {
        // Not all signed - notify next signer for sequential signing
        try {
          console.log('📧 Notifying next signer in sequence...');
          await fetch('/api/signatures/notify-next-signer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId }),
          });
        } catch (notifyError) {
          console.error('Error notifying next signer:', notifyError);
          // Non-blocking - continue even if notification fails
        }

        toast({ title: 'Success', description: 'Document signed successfully! Waiting for other signers.' });
      }

      // Refresh all data sources to update UI
      await fetchData();
      await fetchRequestsToSign();
      await fetchReceivedRequests();

      // Clear active request so UI goes back to list
      setActiveRequest(null);

    } catch (error: any) {
      console.error('Error signing document:', error);
      toast({ title: 'Error', description: error.message || 'Failed to sign document', variant: 'destructive' });
    }
  };

  // Placeholders for other functions not yet connected to DB
  const addField = async (field: any) => console.log('addField', field);
  const updateField = async (id: string, updates: any) => console.log('updateField', id, updates);
  const deleteField = async (id: string) => console.log('deleteField', id);
  const signField = async (id: string, val: string, signerId: string) => console.log('signField');
  const declineToSign = async (id: string, reason: string) => console.log('declineToSign');
  const getAuditLog = async (id: string) => [];

  return {
    requests,
    requestsToSign,
    receivedRequests,
    userSignatures,
    templates,
    stats,
    isLoading,
    activeRequest,
    setActiveRequest,
    refresh: fetchData,
    refreshToSign: fetchRequestsToSign,
    refreshReceived: fetchReceivedRequests,
    createRequest,
    sendRequest,
    cancelRequest,
    addField,
    updateField,
    deleteField,
    signField,
    declineToSign,
    saveUserSignature,
    deleteUserSignature,
    signDocument,
    getAuditLog,
  };
};
