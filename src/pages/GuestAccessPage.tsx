import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, FileText, Download, AlertCircle, Clock, Eye, ExternalLink, X, Lock, ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  getShareLinkByToken,
  incrementShareLinkViewCountByToken,
  incrementDownloadCountByToken,
  isShareLinkValid,
  loadShareLinksFromStorage,
  saveShareLinksToStorage,
  logAccess
} from '@/utils/shareLinkStorage';
import { EnhancedShareLink } from '@/types/shareLink';
import { useToast } from '@/hooks/use-toast';

interface ShareData {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  status: string;
  permission: string;
  allow_download: boolean;
  expires_at?: string;
  download_url?: string;
  use_count?: number;
  password_protected?: boolean;
  password_hash?: string;
}

interface DocumentData {
  id: string;
  file_name: string;
  storage_path?: string;
  file_type?: string;
  extracted_text?: string;
}

export default function GuestAccessPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareData | EnhancedShareLink | null>(null);
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [viewRecorded, setViewRecorded] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewCount, setViewCount] = useState(0);

  // Password protection state
  const [isLocked, setIsLocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const { toast } = useToast();

  // Email verification state (for allowed_emails / allowed_domains)
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [visitorEmail, setVisitorEmail] = useState('');
  const [emailVerificationError, setEmailVerificationError] = useState('');

  // Block Ctrl+S save for view-only links
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+S or Cmd+S (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();

        // Check if permission is view-only
        const permission = share?.permission;
        const allowDownload = 'allow_download' in (share || {}) ? (share as any).allow_download : false;

        if (permission === 'view' || !allowDownload) {
          toast({
            title: '❌ Cannot Save',
            description: 'This document is view-only. Downloads and saving are not permitted.',
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'ℹ️ Use Download Button',
            description: 'Please use the Download button to save this document.'
          });
        }
      }
    };

    window.document.addEventListener('keydown', handleKeyDown);
    return () => window.document.removeEventListener('keydown', handleKeyDown);
  }, [share, toast]);

  // Block right-click context menu globally for view-only documents
  useEffect(() => {
    // Only block when viewing the document
    if (!showViewer || !share) return;

    const permission = 'permission' in share ? share.permission : 'view';

    // For view-only documents, ALWAYS block saving - no exceptions
    const isViewOnly = permission === 'view';

    console.log('🔒 Right-click blocker:', { permission, isViewOnly, showViewer });

    // Only block for view-only permission
    if (!isViewOnly) {
      console.log('⚠️ Not blocking - permission is:', permission);
      return;
    }

    console.log('✅ BLOCKING all right-clicks for view-only document');

    const handleContextMenu = (e: MouseEvent) => {
      console.log('🛑 RIGHT-CLICK BLOCKED');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toast({
        title: '🚫 Saving Disabled',
        description: 'This is a view-only document. Saving is not permitted.',
        variant: 'destructive'
      });
      return false;
    };

    // Add listener to window.document (always available)
    window.document.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      window.document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [share, showViewer, toast]);

  useEffect(() => {
    const fetchShare = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // First, check localStorage for the share link
      const localShare = getShareLinkByToken(token);

      if (localShare) {
        // Validate the share link - but skip limit check if we've already recorded a view in this session
        // This prevents the bug where re-running the effect after recording a view
        // would re-fetch the share with incremented use_count and immediately fail the limit check
        const validation = isShareLinkValid(localShare);
        if (!validation.valid) {
          // If the only issue is max views and we've already recorded a view in this session, allow access
          const isMaxViewsIssue = validation.reason?.includes('maximum views');
          if (isMaxViewsIssue && viewRecorded) {
            // Allow access - we've already recorded our view, don't re-validate
            console.log('🔓 Skipping re-validation after view was recorded');
          } else {
            setError(validation.reason || 'Invalid share link');
            setLoading(false);
            return;
          }
        }

        // Handle password protection
        if (localShare.password_protected) {
          setIsLocked(true);
          setShare(localShare);
          setLoading(false);
          return;
        }

        // Handle email/domain restrictions
        const hasEmailRestrictions = (localShare.blocked_emails && localShare.blocked_emails.length > 0) ||
          (localShare.allowed_domains && localShare.allowed_domains.length > 0);
        if (hasEmailRestrictions) {
          setRequiresEmailVerification(true);
          setShare(localShare);
          setLoading(false);
          return;
        }

        // Record the view and update count
        if (!viewRecorded) {
          incrementShareLinkViewCountByToken(token);
          logAccess(localShare.id, undefined, 'view'); // Log the access locally
          logAccessToBackend(localShare.id, undefined, 'view'); // Log to backend for device tracking
          setViewRecorded(true);
          // Update the local view count
          setViewCount(localShare.use_count + 1);

          // Send access notification if enabled
          if (localShare.notify_on_access) {
            sendAccessNotification(localShare);
          }
        } else {
          setViewCount(localShare.use_count);
        }

        setShare(localShare);

        // Fetch the actual document data from Supabase using direct method (for share links)
        await fetchDocumentDirect(localShare.resource_id);

        setLoading(false);
        return;
      }

      // If not found locally, try the database
      try {
        const { data, error: dbError } = await supabase
          .from('external_shares')
          .select('*')
          .eq('invitation_token', token)
          .single();

        if (dbError || !data) {
          // Also try by token field
          const { data: tokenData, error: tokenError } = await supabase
            .from('external_shares')
            .select('*')
            .eq('token', token)
            .single();

          if (tokenError || !tokenData) {
            setError('Invalid or expired share link');
            setLoading(false);
            return;
          }

          // Found by token field
          if (tokenData.status === 'revoked' || !tokenData.is_active) {
            setError('This share has been revoked');
            setLoading(false);
            return;
          }
          if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
            setError('This share link has expired');
            setLoading(false);
            return;
          }

          // Handle password protection for DB link
          if (tokenData.password_protected) {
            setIsLocked(true);
            setShare(tokenData);
            setLoading(false);
            return;
          }

          setShare(tokenData);
          setViewCount(tokenData.use_count || 0);
          await fetchDocumentFromBackend();
          // Track view via API
          fetch(`/api/shares/${tokenData.id}/view`, { method: 'POST' }).catch(() => { });
          setLoading(false);
          return;
        }

        if (data.status === 'revoked') {
          setError('This share has been revoked');
          setLoading(false);
          return;
        }
        if (data.status === 'expired' || (data.expires_at && new Date(data.expires_at) < new Date())) {
          setError('This share link has expired');
          setLoading(false);
          return;
        }

        // Handle password protection for DB link
        if (data.password_protected) {
          setIsLocked(true);
          setShare(data);
          setLoading(false);
          return;
        }

        setShare(data);
        setViewCount(data.use_count || 0);
        await fetchDocumentFromBackend();
        // Track view via API
        fetch(`/api/shares/${data.id}/view`, { method: 'POST' }).catch(() => { });
        setLoading(false);
      } catch (err) {
        setError('Failed to load share link');
        setLoading(false);
      }
    };

    fetchShare();
  }, [token, viewRecorded]);

  // Block keyboard shortcuts for print/copy when disabled
  // NOTE: This hook MUST be called before any conditional returns to satisfy React's rules of hooks
  useEffect(() => {
    // Early exit if share is not loaded yet
    if (!share) return;

    const permission = 'permission' in share ? share.permission : 'view';
    const allowPrint = 'allow_print' in share ? share.allow_print : false;
    const allowCopy = 'allow_copy' in share ? share.allow_copy : false;
    const canEdit = permission === 'edit';
    const canPrint = canEdit || allowPrint;
    const canCopy = canEdit || allowCopy;

    // Debug logging
    console.log('🔒 Share Link Permissions Debug:', {
      share_has_allow_print: 'allow_print' in share,
      share_has_allow_copy: 'allow_copy' in share,
      allow_print_value: (share as any).allow_print,
      allow_copy_value: (share as any).allow_copy,
      permission,
      allowPrint,
      allowCopy,
      canEdit,
      canPrint,
      canCopy
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('🎹 Key pressed:', e.key, 'Ctrl:', e.ctrlKey);
      // Block Ctrl+P (print) if not allowed
      if (!canPrint && e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        toast({
          title: "Printing Disabled",
          description: "The document owner has disabled printing for this share link.",
          variant: "destructive"
        });
      }
      // Block Ctrl+C (copy) if not allowed
      if (!canCopy && e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        toast({
          title: "Copying Disabled",
          description: "The document owner has disabled copying for this share link.",
          variant: "destructive"
        });
      }
    };

    // Always add the listener if either restriction is active
    console.log('🔒 Adding keyboard listener. canPrint:', canPrint, 'canCopy:', canCopy);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      console.log('🔓 Removing keyboard listener');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [share, toast]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!share) return;

    // In a real app, verify hash. Here we compare directly as per plan.
    if (share.password_hash === passwordInput) {
      setIsLocked(false);
      setPasswordError(false);

      // Check if email verification is also needed
      const hasEmailRestrictions = ('blocked_emails' in share && share.blocked_emails && share.blocked_emails.length > 0) ||
        ('allowed_domains' in share && share.allowed_domains && share.allowed_domains.length > 0);
      if (hasEmailRestrictions) {
        setRequiresEmailVerification(true);
        return;
      }

      // Now that it's unlocked, proceed with view recording and document fetching
      if (!viewRecorded && token) {
        incrementShareLinkViewCountByToken(token);
        setViewRecorded(true);
        setViewCount((share.use_count || 0) + 1);

        // Also track via API if available
        if (share.id && !share.id.startsWith('link-')) {
          fetch(`/api/shares/${share.id}/view`, { method: 'POST' }).catch(() => { });
        }

        // Send access notification if enabled
        if ('notify_on_access' in share && share.notify_on_access) {
          sendAccessNotification(share);
        }
      } else {
        setViewCount(share.use_count || 0);
      }

      await fetchDocumentDirect(share.resource_id);
    } else {
      setPasswordError(true);
      toast({
        title: "Incorrect password",
        description: "Please try again.",
        variant: "destructive"
      });
    }
  };

  // Verify email against blocked_emails and allowed_domains
  const verifyEmailAccess = (email: string, blockedEmails?: string[], allowedDomains?: string[]): boolean => {
    const emailLower = email.toLowerCase().trim();

    // Check if email is in blocked list - DENY access if blocked
    if (blockedEmails && blockedEmails.length > 0) {
      if (blockedEmails.some(e => e.toLowerCase().trim() === emailLower)) {
        return false; // Email is blocked
      }
    }

    // Check if email domain is in allowed list (if domain restrictions exist)
    if (allowedDomains && allowedDomains.length > 0) {
      const emailDomain = emailLower.split('@')[1];
      if (emailDomain && allowedDomains.some(d => d.toLowerCase().trim() === emailDomain)) {
        return true;
      }
      return false; // Domain not in allowed list
    }

    // If no domain restrictions and email not blocked, allow access
    return true;
  };

  // Handle email verification submission
  const handleEmailVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!share) return;

    const blockedEmails = 'blocked_emails' in share ? share.blocked_emails : undefined;
    const allowedDomains = 'allowed_domains' in share ? share.allowed_domains : undefined;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(visitorEmail)) {
      setEmailVerificationError('Please enter a valid email address');
      return;
    }

    // Verify email is not blocked
    if (!verifyEmailAccess(visitorEmail, blockedEmails, allowedDomains)) {
      setEmailVerificationError('Your email is blocked from accessing this document. Please contact the document owner.');
      toast({
        title: "Access Denied",
        description: "Your email is blocked from accessing this document.",
        variant: "destructive"
      });
      return;
    }

    // Email is valid and authorized
    setRequiresEmailVerification(false);
    setEmailVerificationError('');

    // Now proceed with view recording and document fetching
    if (!viewRecorded && token) {
      incrementShareLinkViewCountByToken(token);
      logAccess(share.id, visitorEmail, 'view'); // Log access with verified email
      setViewRecorded(true);
      setViewCount((share.use_count || 0) + 1);

      // Also track via API if available
      if (share.id && !share.id.startsWith('link-')) {
        fetch(`/api/shares/${share.id}/view`, { method: 'POST' }).catch(() => { });
      }

      // Send access notification if enabled
      if ('notify_on_access' in share && share.notify_on_access) {
        sendAccessNotification(share, visitorEmail);
      }
    } else {
      setViewCount(share.use_count || 0);
    }

    await fetchDocumentDirect(share.resource_id);
  };

  // Detect device type from user agent
  const detectDeviceType = (): string => {
    if (typeof navigator === 'undefined') return 'Desktop';

    const ua = navigator.userAgent;

    // Check for tablets first
    if (/iPad|Android(?!.*Mobile)|PlayBook|Tablet/i.test(ua)) {
      return 'Tablet';
    }

    // Check for mobile devices
    if (/Mobile|iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Opera Mobi|Windows Phone/i.test(ua)) {
      return 'Mobile';
    }

    return 'Desktop';
  };

  // Log access to backend for centralized device tracking
  const logAccessToBackend = async (shareId: string, accessorEmail?: string, action: 'view' | 'download' | 'print' = 'view') => {
    try {
      const deviceType = detectDeviceType();
      console.log(`📊 Logging access to backend: ${deviceType} - ${action}`);

      await fetch('/api/shares/log-access-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_id: shareId,
          device_type: deviceType,
          action,
          accessor_email: accessorEmail || 'Anonymous'
        })
      }).catch(err => console.log('Failed to log to backend:', err));
    } catch (err) {
      console.log('Error in logAccessToBackend:', err);
    }
  };

  // Send access notification to the share owner
  const sendAccessNotification = async (shareData: ShareData | EnhancedShareLink, accessorEmail?: string) => {
    try {
      // Get the share owner's user ID (created_by field for local shares)
      const ownerId = 'created_by' in shareData ? shareData.created_by : null;

      if (ownerId && ownerId !== 'current-user') {
        // Insert notification directly into lock_notifications table for real-time updates
        const notificationMessage = accessorEmail
          ? `${accessorEmail} accessed your shared link for "${shareData.resource_name}"`
          : `Someone accessed your shared link for "${shareData.resource_name}"`;

        const { error } = await supabase
          .from('lock_notifications')
          .insert({
            document_id: shareData.resource_id,
            lock_id: shareData.id, // Using share ID as lock_id for reference
            notified_user_id: ownerId,
            notification_type: 'access_requested', // Using existing type for now
            message: notificationMessage,
            is_read: false
          });

        if (error) {
          console.log('Could not insert notification:', error);
        } else {
          console.log('✅ Access notification sent to owner');
        }
      }

      // Also try to send via backend API (for email notifications and bell icon)
      const notifyPayload = {
        share_id: shareData.id,
        resource_name: shareData.resource_name,
        accessor_email: accessorEmail || 'Anonymous',
        accessed_at: new Date().toISOString(),
        owner_id: ownerId // Pass owner_id for local share links (reusing from above)
      };

      await fetch('/api/shares/notify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifyPayload)
      }).catch(() => {
        // Silently fail - notification is not critical
        console.log('Backend notification could not be sent');
      });
    } catch (err) {
      console.log('Error sending access notification:', err);
    }
  };

  const fetchDocumentFromBackend = async () => {
    // For external_shares (guest sharing) - use backend API
    try {
      console.log('🔍 Fetching document via backend API with token:', token);

      const response = await fetch(`/api/guest/document/${token}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Backend API error:', errorData);
        setError(errorData.detail || 'Failed to load document');
        return;
      }

      const data = await response.json();
      console.log('✅ Document data received from backend:', data);

      setDocument({
        id: data.document_id,
        file_name: data.file_name,
        storage_path: null,
        file_type: data.file_type,
        extracted_text: null
      });

      if (data.signed_url) {
        console.log('✅ Signed URL received successfully');
        setDocumentUrl(data.signed_url);
      } else {
        console.error('❌ No signed URL in response');
        setError('Failed to generate document URL');
      }
    } catch (err) {
      console.error('❌ Error fetching document from backend:', err);
      setError(`Failed to load document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const fetchDocumentDirect = async (resourceId: string) => {
    // For localStorage share links - use backend API to bypass RLS
    try {
      console.log('🔍 Fetching document via backend API with resourceId:', resourceId);

      // Call the public backend endpoint that uses service role (bypasses RLS)
      const response = await fetch(`/api/guest/document-by-id/${resourceId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('❌ Backend API error:', errorData);
        setError(errorData.detail || 'Failed to load document');
        return;
      }

      const data = await response.json();
      console.log('✅ Document data received from backend:', data);

      setDocument({
        id: data.document_id,
        file_name: data.file_name,
        storage_path: data.storage_path,
        file_type: data.file_type,
        extracted_text: null
      });

      if (data.signed_url) {
        console.log('✅ Signed URL received successfully');
        setDocumentUrl(data.signed_url);
      } else {
        console.error('❌ No signed URL in response');
        setError('Failed to generate document URL');
      }
    } catch (err) {
      console.error('❌ Error fetching document:', err);
      setError(`Failed to load document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Helper function to determine if file is previewable and what type
  const getPreviewType = (fileType: string | undefined, fileName: string | undefined): 'pdf' | 'image' | 'text' | 'none' => {
    if (!fileType && !fileName) return 'none';

    const type = (fileType || '').toLowerCase();
    const name = (fileName || '').toLowerCase();
    const extension = name.split('.').pop() || '';

    // Check for PDF
    if (type.includes('pdf') || extension === 'pdf') {
      return 'pdf';
    }

    // Check for images
    if (type.includes('image') ||
      ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
      return 'image';
    }

    // Check for text-based documents
    if (type.includes('text') ||
      ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js'].includes(extension)) {
      return 'text';
    }

    return 'none';
  };

  const handleViewDocument = () => {
    console.log('🔘 View Document clicked. documentUrl:', documentUrl);

    if (documentUrl) {
      // Open document in new tab or show in viewer
      setShowViewer(true);
    } else {
      // If no URL, show error with more context
      if (error) {
        alert(`Unable to display document: ${error}`);
      } else {
        alert('Document preview is being prepared. Please try again in a moment.\n\nIf this persists, the document may not be properly uploaded to storage.');
      }
    }
  };

  const handleDownload = async () => {
    if (!share || !token) return;

    setDownloading(true);

    try {
      if (documentUrl) {
        // Track the download
        incrementDownloadCountByToken(token);

        // Check if watermark is enabled for this share
        const hasWatermark = 'watermark_enabled' in share && share.watermark_enabled;
        const watermarkTextToApply = 'watermark_text' in share ? share.watermark_text : 'CONFIDENTIAL';

        if (hasWatermark && document) {
          // Apply watermark before downloading
          const previewType = getPreviewType(document.file_type, document.file_name);

          if (previewType === 'pdf') {
            // For PDFs, call backend API to apply watermark
            toast({
              title: 'Applying watermark...',
              description: 'Preparing your watermarked download',
            });

            try {
              const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
              const response = await fetch(`${backendUrl}/api/watermarks/apply-to-url`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  document_url: documentUrl,
                  watermark_text: watermarkTextToApply || 'CONFIDENTIAL',
                  font_size: 48,
                  rotation: -45,
                  opacity: 0.3,
                  color: '#888888',
                }),
              });

              if (response.ok) {
                const watermarkedBlob = await response.blob();
                const url = window.URL.createObjectURL(watermarkedBlob);
                const a = window.document.createElement('a');
                a.href = url;
                const baseName = document.file_name?.replace(/\.pdf$/i, '') || 'document';
                a.download = `${baseName}_watermarked.pdf`;
                window.document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                window.document.body.removeChild(a);

                toast({
                  title: 'Download complete',
                  description: 'Document with watermark has been downloaded',
                });
                setDownloading(false);
                return;
              } else {
                console.warn('Backend watermark failed, falling back to original download');
              }
            } catch (apiError) {
              console.warn('Watermark API error, falling back to original download:', apiError);
            }
          } else if (previewType === 'image') {
            // For images, apply watermark client-side using canvas
            try {
              const response = await fetch(documentUrl);
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);

              const img = new Image();
              await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                  const canvas = window.document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  if (!ctx) {
                    reject(new Error('Could not create canvas context'));
                    return;
                  }

                  canvas.width = img.width;
                  canvas.height = img.height;

                  // Draw original image
                  ctx.drawImage(img, 0, 0);

                  // Apply watermark
                  ctx.save();
                  ctx.globalAlpha = 0.3;
                  ctx.font = '48px Arial';
                  ctx.fillStyle = '#888888';

                  const text = watermarkTextToApply || 'CONFIDENTIAL';
                  const textMetrics = ctx.measureText(text);
                  const textWidth = textMetrics.width;

                  // Draw tiled watermark
                  const spacing = Math.max(textWidth, 48) * 2;
                  for (let y = -canvas.height; y < canvas.height * 2; y += spacing) {
                    for (let x = -canvas.width; x < canvas.width * 2; x += spacing) {
                      ctx.save();
                      ctx.translate(x, y);
                      ctx.rotate(-45 * Math.PI / 180);
                      ctx.fillText(text, 0, 0);
                      ctx.restore();
                    }
                  }
                  ctx.restore();

                  // Convert to blob and download
                  canvas.toBlob((watermarkedBlob) => {
                    if (watermarkedBlob) {
                      const url = URL.createObjectURL(watermarkedBlob);
                      const a = window.document.createElement('a');
                      a.href = url;
                      const baseName = document.file_name?.replace(/\.[^.]+$/, '') || 'document';
                      const ext = document.file_name?.match(/\.([^.]+)$/)?.[1] || 'png';
                      a.download = `${baseName}_watermarked.${ext}`;
                      window.document.body.appendChild(a);
                      a.click();
                      URL.revokeObjectURL(url);
                      window.document.body.removeChild(a);

                      toast({
                        title: 'Download complete',
                        description: 'Image with watermark has been downloaded',
                      });
                    }
                    resolve();
                  }, 'image/png', 0.95);

                  URL.revokeObjectURL(blobUrl);
                };
                img.onerror = () => {
                  URL.revokeObjectURL(blobUrl);
                  reject(new Error('Failed to load image'));
                };
                img.src = blobUrl;
              });

              setDownloading(false);
              return;
            } catch (imageError) {
              console.warn('Image watermark error, falling back to original download:', imageError);
            }
          }
        }

        // Default download (no watermark or watermark failed)
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = document?.file_name || 'document';
        window.document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        window.document.body.removeChild(a);
      } else {
        alert('Download will be available once the document is fully loaded.');
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download the document. Please try again.');
    }

    setDownloading(false);
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'view': return 'View Only';
      case 'download': return 'Can Download';
      case 'edit': return 'Can Edit';
      default: return permission;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-blue-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-gray-800/50 border-gray-700">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
            <p className="text-gray-400">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!share) return null;

  // Password Challenge UI
  if (isLocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-gray-800/50 border-gray-700 backdrop-blur">
          <CardHeader className="text-center">
            <div className="mx-auto p-4 bg-blue-500/20 rounded-full w-fit mb-4">
              <Lock className="h-8 w-8 text-blue-400" />
            </div>
            <CardTitle className="text-xl text-white">Password Protected</CardTitle>
            <CardDescription className="text-gray-400">
              This document is protected with a password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Enter Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password..."
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className={`bg-gray-900/50 border-gray-600 text-white ${passwordError ? 'border-red-500 ring-1 ring-red-500/50' : ''}`}
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-red-400">Incorrect password</p>
                )}
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                Unlock Document
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center border-t border-gray-700 pt-6">
            <p className="text-xs text-gray-500">
              DocFlow Secure Sharing
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Email Verification Challenge UI
  if (requiresEmailVerification) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-gray-800/50 border-gray-700 backdrop-blur">
          <CardHeader className="text-center">
            <div className="mx-auto p-4 bg-purple-500/20 rounded-full w-fit mb-4">
              <Mail className="h-8 w-8 text-purple-400" />
            </div>
            <CardTitle className="text-xl text-white">Email Verification Required</CardTitle>
            <CardDescription className="text-gray-400">
              This document is restricted to specific email addresses or domains.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailVerificationSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Your Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={visitorEmail}
                  onChange={(e) => {
                    setVisitorEmail(e.target.value);
                    setEmailVerificationError('');
                  }}
                  className={`bg-gray-900/50 border-gray-600 text-white ${emailVerificationError ? 'border-red-500 ring-1 ring-red-500/50' : ''}`}
                  autoFocus
                />
                {emailVerificationError && (
                  <p className="text-sm text-red-400">{emailVerificationError}</p>
                )}
              </div>
              <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700">
                Verify & Access Document
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center border-t border-gray-700 pt-6">
            <p className="text-xs text-gray-500">
              DocFlow Secure Sharing • Email Restricted
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const resourceName = 'resource_name' in share ? share.resource_name : 'Shared Document';
  const permission = 'permission' in share ? share.permission : 'view';
  const allowDownload = 'allow_download' in share ? share.allow_download : false;
  const expiresAt = 'expires_at' in share ? share.expires_at : undefined;

  // Extract advanced settings from share
  const allowPrint = 'allow_print' in share ? share.allow_print : false;
  const allowCopy = 'allow_copy' in share ? share.allow_copy : false;
  const watermarkEnabled = 'watermark_enabled' in share ? share.watermark_enabled : false;
  const watermarkText = 'watermark_text' in share ? share.watermark_text : '';
  const maxUses = 'max_uses' in share ? share.max_uses : undefined;
  const useCount = 'use_count' in share ? share.use_count : 0;

  const canEdit = permission === 'edit';
  const canDownload = canEdit || permission === 'download' || allowDownload;
  const canPrint = canEdit || allowPrint;
  const canCopy = canEdit || allowCopy;

  // Check max uses limit (after all hooks)
  // Only show the limit reached message if we haven't recorded a view in this session
  // If viewRecorded is true, the user is in an active valid session and shouldn't be blocked
  if (maxUses && useCount >= maxUses && !viewRecorded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-gray-800/50 border-gray-700 backdrop-blur">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Access Limit Reached</h2>
            <p className="text-gray-400">
              This share link has reached its maximum number of uses ({maxUses}).
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // PDF URL with toolbar disabled for non-edit permissions
  const getPdfViewerUrl = (url: string) => {
    if (canEdit) {
      return url; // Full PDF viewer with annotation tools
    }
    // Hide toolbar, navigation panes, and disable printing for view-only
    return `${url}#toolbar=0&navpanes=0&scrollbar=1`;
  };

  // Show document viewer
  if (showViewer && documentUrl) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-blue-400" />
            <span className="text-white font-medium">{resourceName}</span>
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
              {getPermissionLabel(permission)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {canDownload && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                disabled={downloading}
                className="border-gray-600 text-gray-300 download-btn"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowViewer(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Document Viewer with Watermark */}
        <div
          className={`flex-1 p-4 relative ${!canCopy ? 'select-none' : ''}`}
          onContextMenu={!canDownload ? (e) => {
            e.preventDefault();
            toast({
              title: "Right-click Disabled",
              description: "This is a view-only document. Saving is not permitted.",
              variant: "destructive"
            });
          } : undefined}
        >
          {/* Watermark Overlay */}
          {watermarkEnabled && (
            <div
              className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-hidden"
              style={{
                background: 'repeating-linear-gradient(45deg, transparent, transparent 200px, rgba(128,128,128,0.03) 200px, rgba(128,128,128,0.03) 400px)'
              }}
            >
              <div
                className="text-gray-500/20 text-4xl font-bold whitespace-nowrap transform -rotate-45"
                style={{
                  fontSize: '4rem',
                  userSelect: 'none'
                }}
              >
                {watermarkText || 'CONFIDENTIAL'}
              </div>
            </div>
          )}

          {(() => {
            const previewType = getPreviewType(document?.file_type, document?.file_name);

            if (previewType === 'pdf') {
              return (
                <iframe
                  src={getPdfViewerUrl(documentUrl)}
                  className="w-full h-full min-h-[calc(100vh-80px)] rounded-lg border border-gray-700"
                  title={resourceName}
                  // Disable right-click for non-edit permissions
                  onContextMenu={canEdit ? undefined : (e) => e.preventDefault()}
                />
              );
            } else if (previewType === 'image') {
              // Block right-click if download is not allowed
              return (
                <div
                  className="flex items-center justify-center h-full"
                  onContextMenu={!canDownload ? (e) => {
                    e.preventDefault();
                    toast({
                      title: "Right-click Disabled",
                      description: "Saving is disabled for this document.",
                      variant: "destructive"
                    });
                  } : undefined}
                >
                  <img
                    src={documentUrl || ''}
                    alt={resourceName}
                    className={`max-w-full max-h-[calc(100vh-100px)] rounded-lg shadow-xl ${!canDownload ? 'pointer-events-none' : ''}`}
                    draggable={canDownload}
                    style={!canDownload ? { WebkitUserDrag: 'none' } as React.CSSProperties : undefined}
                  />
                </div>
              );
            } else if (previewType === 'text' && document?.extracted_text) {
              return (
                <div
                  className={`max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8 min-h-[calc(100vh-100px)] ${!canCopy ? 'select-none' : ''}`}
                  onContextMenu={canCopy ? undefined : (e) => e.preventDefault()}
                >
                  <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">
                    {document.extracted_text}
                  </pre>
                </div>
              );
            } else {
              return (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="h-20 w-20 text-gray-600 mb-4" />
                  <p className="text-gray-400 mb-2">Preview not available for this file type</p>
                  <p className="text-gray-500 text-sm mb-4">
                    File: {document?.file_name || 'Unknown'}
                    {document?.file_type && <span> ({document.file_type})</span>}
                  </p>
                  {canDownload && (
                    <Button onClick={handleDownload} disabled={downloading}>
                      <Download className="h-4 w-4 mr-2" />
                      Download to View
                    </Button>
                  )}
                </div>
              );
            }
          })()}
        </div>
      </div>
    );
  }

  // Main share info page
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full bg-gray-800/50 border-gray-700 backdrop-blur">
        <CardHeader className="text-center border-b border-gray-700">
          <div className="mx-auto p-4 bg-blue-500/20 rounded-full w-fit mb-4">
            <FileText className="h-10 w-10 text-blue-400" />
          </div>
          <CardTitle className="text-2xl text-white">{resourceName}</CardTitle>
          <CardDescription className="text-gray-400">
            You have been granted guest access to this document
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Permission Badge */}
          <div className="flex items-center justify-center gap-3">
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 px-3 py-1">
              <Eye className="w-3 h-3 mr-1" />
              {getPermissionLabel(permission)}
            </Badge>
            {expiresAt && (
              <Badge variant="outline" className="text-gray-400 border-gray-600">
                <Clock className="w-3 h-3 mr-1" />
                Expires {new Date(expiresAt).toLocaleDateString()}
              </Badge>
            )}
          </div>

          {/* View Count */}
          <div className="text-center text-sm text-gray-500">
            This document has been viewed {viewCount} time{viewCount !== 1 ? 's' : ''}
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-4">
            {canDownload && (
              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {downloading ? 'Downloading...' : 'Download'}
              </Button>
            )}
            <Button
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={handleViewDocument}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Document
            </Button>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-gray-500">
            Shared via DocFlow • Secure document sharing
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
