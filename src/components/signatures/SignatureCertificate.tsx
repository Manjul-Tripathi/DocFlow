import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, CheckCircle } from 'lucide-react';
import type { SignatureRequest } from '@/types/signature';

interface SignatureCertificateProps {
    request: SignatureRequest;
    open: boolean;
    onClose: () => void;
}

export const SignatureCertificate: React.FC<SignatureCertificateProps> = ({
    request,
    open,
    onClose,
}) => {
    const handleDownload = () => {
        // Create a printable certificate
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Certificate of Completion</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 p-6 bg-white" id="certificate">
                    {/* Header */}
                    <div className="text-center border-b pb-6">
                        <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-700 px-4 py-2 rounded-full mb-4">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-semibold">Fully Executed</span>
                        </div>
                        <h1 className="text-3xl font-bold mt-4">{request.title}</h1>
                        <p className="text-muted-foreground mt-2">
                            Completed on {new Date(request.completed_at || '').toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>

                    {/* Document Info */}
                    <div className="bg-muted/30 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2">Document Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Document Name</p>
                                <p className="font-medium">{request.document_name || 'Untitled Document'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Request ID</p>
                                <p className="font-mono text-xs">{request.id}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Created</p>
                                <p className="font-medium">{new Date(request.created_at).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Total Signers</p>
                                <p className="font-medium">{request.signers?.length || 0}</p>
                            </div>
                        </div>
                    </div>

                    {/* Message */}
                    {request.message && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h3 className="font-semibold text-blue-900 mb-2">Message</h3>
                            <p className="text-blue-800">{request.message}</p>
                        </div>
                    )}

                    {/* Signatures */}
                    <div>
                        <h3 className="font-semibold mb-4 text-lg">Signatures</h3>
                        <div className="space-y-4">
                            {request.signers?.map((signer, index) => (
                                <div key={signer.id} className="border rounded-lg p-4 bg-card">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <p className="font-semibold">{signer.name}</p>
                                            <p className="text-sm text-muted-foreground">{signer.email}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Role: {signer.role.charAt(0).toUpperCase() + signer.role.slice(1)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="inline-flex items-center gap-1 bg-green-500/10 text-green-700 px-3 py-1 rounded-full text-sm">
                                                <CheckCircle className="h-3 w-3" />
                                                Signed
                                            </div>
                                            {signer.signed_at && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {new Date(signer.signed_at).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Signature Image */}
                                    {signer.signature_data_url && (
                                        <div className="mt-3 border-t pt-3">
                                            <p className="text-xs text-muted-foreground mb-2">Electronic Signature:</p>
                                            <div className="bg-white border rounded p-2 inline-block">
                                                <img
                                                    src={signer.signature_data_url}
                                                    alt={`${signer.name}'s signature`}
                                                    className="h-16 object-contain"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t pt-6 text-center text-sm text-muted-foreground">
                        <p>This is a legally binding electronic signature certificate.</p>
                        <p className="mt-1">All parties have consented to conduct this transaction electronically.</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={handleDownload} className="gap-2">
                        <Download className="h-4 w-4" />
                        Print Certificate
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
