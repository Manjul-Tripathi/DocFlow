"""
Email Service for Guest Sharing
Sends invitation emails to guests using SimplifyAI Pro API
"""

import os
import httpx
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# SimplifyAI Pro Email API Configuration
EMAIL_API_URL = "https://scheduler.simplifyaipro.com/send_email"
EMAIL_API_PASSCODE = "1234567890"

class EmailService:
    """Email service using SimplifyAI Pro API"""
    
    def __init__(self):
        self.api_url = EMAIL_API_URL
        self.passcode = EMAIL_API_PASSCODE
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send email using SimplifyAI Pro API
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML email body
            text_content: Plain text email body (optional, not used by API)
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Prepare form data for the API
            form_data = {
                "subject": subject,
                "html_body": html_content,
                "receivers": to_email,
                "passcode": self.passcode
            }
            
            # Debug: Print what we're sending
            print(f"\n{'='*60}")
            print(f"📧 SENDING EMAIL via SimplifyAI Pro API")
            print(f"{'='*60}")
            print(f"To: {to_email}")
            print(f"Subject: {subject}")
            print(f"API URL: {self.api_url}")
            print(f"{'='*60}")
            
            # Send request to SimplifyAI Pro API
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.api_url,
                    data=form_data
                )
                
                # Debug: Print full response
                print(f"📬 API Response Status: {response.status_code}")
                print(f"📬 API Response Body: {response.text}")
                print(f"{'='*60}\n")
                
                if response.status_code == 200:
                    logger.info(f"✅ Email sent successfully to {to_email}")
                    print(f"✅ SUCCESS: Email API accepted the request for {to_email}")
                    return True
                else:
                    logger.error(f"❌ Failed to send email. Status: {response.status_code}, Response: {response.text}")
                    print(f"❌ FAILED: API returned status {response.status_code}")
                    return False
        
        except Exception as e:
            logger.error(f"❌ Failed to send email to {to_email}: {str(e)}")
            # Fallback: log the email content for debugging
            print(f"\n{'='*20} [EMAIL SEND FAILED - PREVIEW] {'='*20}")
            print(f"To: {to_email}")
            print(f"Subject: {subject}")
            print(f"Error: {str(e)}")
            print(f"{'='*60}\n")
            return False


def send_guest_invitation(
    guest_email: str,
    guest_name: Optional[str],
    owner_name: str,
    document_name: str,
    share_url: str,
    permission: str,
    expires_at: Optional[str] = None,
    message: Optional[str] = None
) -> bool:
    """
    Send guest invitation email
    
    Args:
        guest_email: Guest's email address
        guest_name: Guest's name (optional)
        owner_name: Name of the person sharing
        document_name: Name of the document being shared
        share_url: URL guest can use to access the document
        permission: Permission level (view, comment, download, edit)
        expires_at: When the share expires (optional)
        message: Custom message from owner (optional)
    
    Returns:
        True if successful, False otherwise
    """
    
    service = EmailService()
    
    # Determine what guest can do
    permission_text = {
        'view': 'view this document',
        'comment': 'view and comment on this document',
        'download': 'view, comment, and download this document',
        'edit': 'view, comment, download, and edit this document'
    }.get(permission, 'access this document')
    
    # Format expiration date
    expiration_text = ''
    if expires_at:
        try:
            exp_date = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            expiration_text = f"<p style='color: #666; font-size: 14px;'>This link expires on {exp_date.strftime('%B %d, %Y')}</p>"
        except:
            pass
    
    # Create HTML email
    html_content = f"""
    <html>
        <head>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }}
                .button {{
                    display: inline-block;
                    background-color: #007bff;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 20px 0;
                    font-weight: 500;
                }}
                .footer {{
                    color: #999;
                    font-size: 12px;
                    border-top: 1px solid #eee;
                    padding-top: 20px;
                    margin-top: 20px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>📄 You've been invited to view a document</h2>
                </div>
                
                <p>Hi {guest_name or 'there'},</p>
                
                <p><strong>{owner_name}</strong> has shared "<strong>{document_name}</strong>" with you.</p>
                
                <p>You'll be able to <strong>{permission_text}</strong>.</p>
                
                <center>
                    <a href="{share_url}" class="button">View Document</a>
                </center>
                
                <p><strong>Or copy this link:</strong><br/>
                <code style="background-color: #f5f5f5; padding: 10px; display: block; word-break: break-all; border-radius: 4px;">{share_url}</code>
                </p>
                
                {expiration_text}
                
                {f'<p><strong>Message from {owner_name}:</strong><br/>{message}</p>' if message else ''}
                
                <div class="footer">
                    <p>This link was generated by DocFlow. If you didn't expect this email, you can ignore it.</p>
                    <p>&copy; 2025 DocFlow. All rights reserved.</p>
                </div>
            </div>
        </body>
    </html>
    """
    
    # Create plain text version
    text_content = f"""You've been invited to view a document

Hi {guest_name or 'there'},

{owner_name} has shared "{document_name}" with you.

You'll be able to {permission_text}.

View Document:
{share_url}

{f'Message from {owner_name}:' + chr(10) + message if message else ''}

{f'This link expires on {datetime.fromisoformat(expires_at.replace("Z", "+00:00")).strftime("%B %d, %Y")}' if expires_at else ''}

---
This link was generated by DocFlow. If you didn't expect this email, you can ignore it.
© 2025 DocFlow. All rights reserved.
    """
    
    # Send email
    subject = f"{owner_name} shared '{document_name}' with you"
    return service.send_email(to_email=guest_email, subject=subject, html_content=html_content, text_content=text_content)


def send_signature_request_email(
    recipient_email: str,
    recipient_name: str,
    sender_name: str,
    document_title: str,
    message: Optional[str] = None,
    signing_url: Optional[str] = None,
    expires_at: Optional[str] = None
) -> bool:
    """
    Send signature request email
    
    Args:
        recipient_email: Signer's email address
        recipient_name: Signer's name
        sender_name: Name of person requesting signature
        document_title: Title of the signature request
        message: Custom message from sender (optional)
        signing_url: URL for signing (optional, for future use)
        expires_at: When the request expires (optional)
    
    Returns:
        True if successful, False otherwise
    """
    
    service = EmailService()
    
    # Format expiration date
    expiration_text = ''
    if expires_at:
        try:
            exp_date = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            expiration_text = f"<p style='color: #dc3545; font-size: 14px;'><strong>⏰ This request expires on {exp_date.strftime('%B %d, %Y')}</strong></p>"
        except:
            pass
    
    # Access URL text
    access_text = ''
    if signing_url:
        access_text = f"""
        <center>
            <a href="{signing_url}" class="button">Sign Document</a>
        </center>
        
        <p><strong>Or copy this link:</strong><br/>
        <code style="background-color: #f5f5f5; padding: 10px; display: block; word-break: break-all; border-radius: 4px;">{signing_url}</code>
        </p>
        """
    else:
        access_text = "<p>You'll receive another email with a link to sign when the document is ready.</p>"
    
    # Create HTML email
    html_content = f"""
    <html>
        <head>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    text-align: center;
                }}
                .button {{
                    display: inline-block;
                    background-color: #667eea;
                    color: white !important;
                    padding: 14px 28px;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 20px 0;
                    font-weight: 600;
                    box-shadow: 0 4px 6px rgba(102, 126, 234, 0.2);
                }}
                .button:hover {{
                    background-color: #5568d3;
                }}
                .info-box {{
                    background-color: #f8f9fa;
                    border-left: 4px solid #667eea;
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 4px;
                }}
                .footer {{
                    color: #999;
                    font-size: 12px;
                    border-top: 1px solid #eee;
                    padding-top: 20px;
                    margin-top: 20px;
                    text-align: center;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 28px;">✍️ Signature Request</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Your signature is requested</p>
                </div>
                
                <p>Hi <strong>{recipient_name}</strong>,</p>
                
                <p><strong>{sender_name}</strong> has requested your signature on:</p>
                
                <div class="info-box">
                    <p style="margin: 0; font-size: 16px; font-weight: 600;">📄 {document_title}</p>
                </div>
                
                {f'<div class="info-box"><p style="margin: 0;"><strong>Message:</strong><br/>{message}</p></div>' if message else ''}
                
                {expiration_text}
                
                {access_text}
                
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                    Please review and sign the document at your earliest convenience.
                </p>
                
                <div class="footer">
                    <p>This is an automated message from SimplifyDrive E-Signatures.</p>
                    <p>If you believe you received this email in error, please ignore it.</p>
                    <p>&copy; 2025 SimplifyDrive. All rights reserved.</p>
                </div>
            </div>
        </body>
    </html>
    """
    
    # Create plain text version
    text_content = f"""Signature Request

Hi {recipient_name},

{sender_name} has requested your signature on:
📄 {document_title}

{f'Message: {message}' if message else ''}

{f'This request expires on {datetime.fromisoformat(expires_at.replace("Z", "+00:00")).strftime("%B %d, %Y")}' if expires_at else ''}

{'Sign Document:' + chr(10) + signing_url if signing_url else 'You will receive another email with a link to sign when the document is ready.'}

---
This is an automated message from SimplifyDrive E-Signatures.
If you believe you received this email in error, please ignore it.
© 2025 SimplifyDrive. All rights reserved.
    """
    
    # Send email
    subject = f"📝 Signature Request: {document_title}"
    return service.send_email(to_email=recipient_email, subject=subject, html_content=html_content, text_content=text_content)
