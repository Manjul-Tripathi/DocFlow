/**
 * OAuthService - Frontend-only OAuth handler for all cloud providers
 * No backend OAuth endpoints needed - everything handled client-side
 */

export interface OAuthProvider {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    icon: 'google',
    color: 'blue'
  },
  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    icon: 'microsoft',
    color: 'blue'
  }
};

export interface OAuthResult {
  success: boolean;
  provider: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  error?: string;
}

// OAuth Config - these should be in env variables
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const MICROSOFT_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID || '';

class OAuthService {
  /**
   * Initiate OAuth flow using standard OAuth 2.0 popup
   * This avoids the storagerelay:// redirect issue with Google Identity Services
   */
  async authenticateGoogle(): Promise<OAuthResult> {
    return new Promise((resolve, reject) => {
      try {
        if (!GOOGLE_CLIENT_ID) {
          reject(new Error('Google Client ID not configured'));
          return;
        }

        // Build OAuth URL - use drive.readonly for listing files
        const redirectUri = `${window.location.origin}/oauth-callback.html`;
        const scope = 'https://www.googleapis.com/auth/drive.readonly';

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('prompt', 'select_account');

        // Open popup
        const width = 500;
        const height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        const popup = window.open(
          authUrl.toString(),
          'Google Sign In',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup) {
          reject(new Error('Failed to open popup. Please allow popups for this site.'));
          return;
        }

        // Listen for OAuth callback
        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data.type === 'oauth-success') {
            window.removeEventListener('message', handleMessage);
            resolve({
              success: true,
              provider: 'google_drive',
              accessToken: event.data.accessToken,
              expiresIn: event.data.expiresIn ? parseInt(event.data.expiresIn) : undefined
            });
          } else if (event.data.type === 'oauth-error') {
            window.removeEventListener('message', handleMessage);
            reject(new Error(event.data.error || 'Authentication failed'));
          }
        };

        window.addEventListener('message', handleMessage);

        // Check if popup was closed
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            reject(new Error('Authentication cancelled'));
          }
        }, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initiate OAuth flow using Microsoft's MSAL library
   */
  async authenticateMicrosoft(): Promise<OAuthResult> {
    return new Promise(async (resolve, reject) => {
      try {
        // Load MSAL library dynamically
        if (!(window as any).msal) {
          const script = document.createElement('script');
          script.src = 'https://alcdn.msauth.net/browser/2.38.1/js/msal-browser.min.js';
          script.async = true;

          await new Promise((res, rej) => {
            script.onload = res;
            script.onerror = rej;
            document.body.appendChild(script);
          });
        }

        const msal = (window as any).msal;

        const msalConfig = {
          auth: {
            clientId: MICROSOFT_CLIENT_ID,
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin,
          },
        };

        const msalInstance = new msal.PublicClientApplication(msalConfig);
        await msalInstance.initialize();

        const loginRequest = {
          scopes: ['Files.Read.All'],
          prompt: 'select_account',
        };

        const response = await msalInstance.loginPopup(loginRequest);

        resolve({
          success: true,
          provider: 'onedrive',
          accessToken: response.accessToken,
          expiresIn: response.expiresOn ?
            Math.floor((response.expiresOn.getTime() - Date.now()) / 1000) : 3600,
          scope: response.scopes?.join(' ')
        });

      } catch (error: any) {
        if (error.errorCode === 'user_cancelled') {
          reject(new Error('Authentication cancelled'));
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * Generic authenticate method
   */
  async authenticate(provider: string): Promise<OAuthResult> {
    if (provider === 'google_drive') {
      return this.authenticateGoogle();
    } else if (provider === 'onedrive') {
      return this.authenticateMicrosoft();
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

// Export singleton instance
export const oauthService = new OAuthService();
