import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, AlertCircle, PenTool } from 'lucide-react';

export const SigningPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [signerData, setSignerData] = useState<any>(null);
    const [requestData, setRequestData] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Auth form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        fetchSigningData();
        checkCurrentUser();
    }, [token]);

    const checkCurrentUser = async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
            setCurrentUser(data.user);
            // If user is already logged in and we have signer data, redirect immediately
            if (signerData) {
                navigate('/documents?feature=signatures&requestId=' + signerData.request_id);
            }
        }
    };

    const fetchSigningData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch signer details by token
            const { data: signer, error: signerError } = await supabase
                .from('signature_signers')
                .select('*')
                .eq('access_token', token)
                .single();

            if (signerError || !signer) {
                setError('Invalid or expired signing link');
                setLoading(false);
                return;
            }

            setSignerData(signer);
            setEmail(signer.email); // Pre-fill email

            // Fetch signature request details
            const { data: request, error: requestError } = await supabase
                .from('signature_requests')
                .select('*')
                .eq('id', signer.request_id)
                .single();

            if (requestError || !request) {
                setError('Signature request not found');
                setLoading(false);
                return;
            }

            setRequestData(request);
            setLoading(false);

            // If user is already authenticated, check email match before redirecting
            const { data: userData } = await supabase.auth.getUser();
            if (userData.user) {
                // Verify logged-in user's email matches signer email
                if (userData.user.email?.toLowerCase() === signer.email.toLowerCase()) {
                    // Email matches - allow access
                    navigate('/documents?feature=signatures&requestId=' + signer.request_id);
                } else {
                    // Email doesn't match - set current user but show mismatch error
                    setCurrentUser(userData.user);
                    setAuthError(`This document was sent to ${signer.email}. You are currently signed in as ${userData.user.email}. Please sign out and sign in with the correct email.`);
                }
            }
        } catch (err) {
            console.error('Error fetching signing data:', err);
            setError('Failed to load signing information');
            setLoading(false);
        }
    };

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSigningIn(true);
        setAuthError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // Verify email matches signer email
            if (data.user.email !== signerData.email) {
                setAuthError('Please sign in with the email address the request was sent to');
                await supabase.auth.signOut();
                return;
            }

            // Redirect to E-Signature dashboard
            // The dashboard will show this specific request
            navigate('/documents?feature=signatures&requestId=' + signerData.request_id);

        } catch (err: any) {
            setAuthError(err.message || 'Failed to sign in');
            setIsSigningIn(false);
        }
    };

    const handleCreateAccount = () => {
        // Navigate to sign up page with email pre-filled
        navigate(`/signup?email=${encodeURIComponent(email)}&returnTo=/sign/${token}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                    <p className="text-muted-foreground">Loading signature request...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
                <Card className="max-w-md w-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            Invalid Link
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">{error}</p>
                        <Button onClick={() => navigate('/')} className="mt-4 w-full">
                            Go to Home
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // If user is logged in but with wrong email, show mismatch error
    if (currentUser && authError) {
        const handleSignOut = async () => {
            await supabase.auth.signOut();
            setCurrentUser(null);
            setAuthError(null);
        };

        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                            <AlertCircle className="h-6 w-6 text-orange-600" />
                        </div>
                        <CardTitle>Wrong Account</CardTitle>
                        <CardDescription>
                            You need to sign in with a different account
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{authError}</AlertDescription>
                        </Alert>

                        <div className="space-y-4">
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="text-sm font-medium">Document</p>
                                <p className="text-sm text-muted-foreground">{requestData?.title}</p>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="text-sm font-medium">Sent to</p>
                                <p className="text-sm text-muted-foreground">{signerData?.email}</p>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="text-sm font-medium">Currently signed in as</p>
                                <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                            </div>
                        </div>

                        <Button onClick={handleSignOut} className="w-full mt-6">
                            Sign Out & Use Correct Account
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // If user is not authenticated, show sign-in form
    if (!currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <PenTool className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle>Sign Document</CardTitle>
                        <CardDescription>
                            You've been invited to sign: <strong>{requestData?.title}</strong>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Alert className="mb-4">
                            <AlertDescription>
                                Please sign in to SimplifyDrive to review and sign this document.
                            </AlertDescription>
                        </Alert>

                        <form onSubmit={handleSignIn} className="space-y-4">
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled
                                    className="bg-muted"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    This document was sent to this email address
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    placeholder="Enter your password"
                                />
                            </div>

                            {authError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{authError}</AlertDescription>
                                </Alert>
                            )}

                            <Button type="submit" className="w-full" disabled={isSigningIn}>
                                {isSigningIn ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </Button>
                        </form>

                        <div className="mt-4 text-center">
                            <p className="text-sm text-muted-foreground mb-2">Don't have an account?</p>
                            <Button variant="outline" onClick={handleCreateAccount} className="w-full">
                                Create SimplifyDrive Account
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // User is authenticated - redirect happens in handleSignIn
    // This section won't be reached
    return null;
};
