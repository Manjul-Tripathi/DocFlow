"""
Signature Request Email API
Sends email notifications when signature requests are created/sent
Also generates signed PDFs with embedded signatures
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from supabase import create_client, Client
import os
import io
import base64
import httpx
import fitz  # PyMuPDF
from datetime import datetime
from app.services.email import send_signature_request_email

router = APIRouter(prefix="/api/signatures", tags=["signatures"])

# Lazy-loaded Supabase client to avoid initialization issues
_supabase_client = None

def get_supabase() -> Client:
    """Get or create Supabase client (lazy loading)"""
    global _supabase_client
    if _supabase_client is None:
        SUPABASE_URL = os.getenv("SUPABASE_URL")
        SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(status_code=500, detail="Supabase configuration missing")
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client


class SendSignatureEmailsRequest(BaseModel):
    request_id: str


@router.post("/send-emails")
async def send_signature_request_emails(body: SendSignatureEmailsRequest):
    """
    Send email notifications to signers for a signature request.
    For sequential signing: only sends to the first pending signer.
    For parallel signing: sends to all signers at once.
    """
    try:
        # Get the signature request details
        response = get_supabase().table('signature_requests').select(
            '*'
        ).eq('id', body.request_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Signature request not found")
        
        request_data = response.data
        is_sequential = request_data.get('signing_order') == 'sequential'
        
        # Get all signers for this request, ordered by signing_order
        signers_response = get_supabase().table('signature_signers').select(
            '*'
        ).eq('request_id', body.request_id).order('signing_order').execute()
        
        if not signers_response.data:
            raise HTTPException(status_code=404, detail="No signers found for this request")
        
        all_signers = signers_response.data
        
        # For sequential signing, only include the first pending signer
        if is_sequential:
            # Find signers who haven't been sent an email yet and haven't signed
            pending_signers = [s for s in all_signers if s.get('status') in ['pending', None] and s.get('role') in ['signer', 'approver']]
            signers_to_email = pending_signers[:1] if pending_signers else []
            print(f"🔄 Sequential signing: sending to first pending signer only ({len(signers_to_email)} signer)")
        else:
            # Parallel signing: send to all signers who haven't signed yet
            signers_to_email = [s for s in all_signers if s.get('status') != 'signed']
            print(f"⏩ Parallel signing: sending to all {len(signers_to_email)} pending signers")
        
        # Get user details (sender)
        user_response = get_supabase().auth.admin.get_user_by_id(request_data['user_id'])
        sender_email = user_response.user.email if user_response and user_response.user else "SimplifyDrive User"
        # Extract name from email (before @)
        sender_name = sender_email.split('@')[0].replace('.', ' ').replace('_', ' ').title()
        
        # Send email to each signer
        success_count = 0
        failed_count = 0
        
        for signer in signers_to_email:
            try:
                # Generate signing URL with token
                # Token already exists in access_token field from when signer was created
                token = signer.get('access_token')
                if not token:
                    # Generate new token if it doesn't exist
                    import secrets
                    token = secrets.token_urlsafe(32)
                    # Update signer with token
                    get_supabase().table('signature_signers').update({
                        'access_token': token
                    }).eq('id', signer['id']).execute()
                
                # Generate signing URL
                # Use environment variable for frontend URL or default to localhost
                frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:4173')
                signing_url = f"{frontend_url}/sign/{token}"
                
                # Send email
                email_sent = send_signature_request_email(
                    recipient_email=signer['email'],
                    recipient_name=signer['name'],
                    sender_name=sender_name,
                    document_title=request_data['title'],
                    message=request_data.get('message'),
                    signing_url=signing_url,
                    expires_at=request_data.get('expires_at')
                )
                
                if email_sent:
                    success_count += 1
                    # Update signer status to 'sent'
                    get_supabase().table('signature_signers').update({
                        'status': 'sent',
                        'sent_at': 'now()'
                    }).eq('id', signer['id']).execute()
                else:
                    failed_count += 1
                    
            except Exception as e:
                print(f"Failed to send email to {signer['email']}: {str(e)}")
                failed_count += 1
        
        return {
            "success": True,
            "message": f"Sent {success_count} emails successfully, {failed_count} failed", 
            "sent_count": success_count,
            "failed_count": failed_count,
            "is_sequential": is_sequential
        }
        
    except Exception as e:
        print(f"Error sending signature request emails: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class NotifyNextSignerRequest(BaseModel):
    request_id: str


@router.post("/notify-next-signer")
async def notify_next_signer(body: NotifyNextSignerRequest):
    """
    For sequential signing: send email notification to the next pending signer.
    Called after a signer completes their signature.
    """
    try:
        # Get the signature request details
        response = get_supabase().table('signature_requests').select(
            '*'
        ).eq('id', body.request_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Signature request not found")
        
        request_data = response.data
        
        # Only applies to sequential signing
        if request_data.get('signing_order') != 'sequential':
            return {"success": True, "message": "Not sequential signing, no action needed", "sent": False}
        
        # Get all signers ordered by signing_order
        signers_response = get_supabase().table('signature_signers').select(
            '*'
        ).eq('request_id', body.request_id).order('signing_order').execute()
        
        if not signers_response.data:
            return {"success": True, "message": "No signers found", "sent": False}
        
        # Find the next signer who needs to sign (pending status, signer/approver role)
        next_signer = None
        for signer in signers_response.data:
            if signer.get('status') in ['pending', None] and signer.get('role') in ['signer', 'approver']:
                next_signer = signer
                break
        
        if not next_signer:
            return {"success": True, "message": "All signers have been notified or have signed", "sent": False}
        
        # Get sender info
        user_response = get_supabase().auth.admin.get_user_by_id(request_data['user_id'])
        sender_email = user_response.user.email if user_response and user_response.user else "SimplifyDrive User"
        sender_name = sender_email.split('@')[0].replace('.', ' ').replace('_', ' ').title()
        
        # Get or generate token
        token = next_signer.get('access_token')
        if not token:
            import secrets
            token = secrets.token_urlsafe(32)
            get_supabase().table('signature_signers').update({
                'access_token': token
            }).eq('id', next_signer['id']).execute()
        
        # Generate signing URL
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:4173')
        signing_url = f"{frontend_url}/sign/{token}"
        
        # Send email
        email_sent = send_signature_request_email(
            recipient_email=next_signer['email'],
            recipient_name=next_signer['name'],
            sender_name=sender_name,
            document_title=request_data['title'],
            message=f"It's your turn to sign! Previous signers have completed their signatures.\n\n{request_data.get('message', '')}",
            signing_url=signing_url,
            expires_at=request_data.get('expires_at')
        )
        
        if email_sent:
            # Update signer status to 'sent'
            get_supabase().table('signature_signers').update({
                'status': 'sent',
                'sent_at': 'now()'
            }).eq('id', next_signer['id']).execute()
            
            print(f"✅ Notified next signer in sequence: {next_signer['email']}")
            return {
                "success": True,
                "message": f"Email sent to next signer: {next_signer['email']}",
                "sent": True,
                "next_signer_email": next_signer['email']
            }
        else:
            return {"success": False, "message": "Failed to send email to next signer", "sent": False}
        
    except Exception as e:
        print(f"Error notifying next signer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class CheckSignerTurnRequest(BaseModel):
    request_id: str
    signer_email: str


@router.post("/check-signer-turn")
async def check_signer_turn(body: CheckSignerTurnRequest):
    """
    Check if it's the signer's turn in a sequential signing flow.
    Returns whether the signer can sign now.
    """
    try:
        # Get the signature request
        response = get_supabase().table('signature_requests').select(
            '*'
        ).eq('id', body.request_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Signature request not found")
        
        request_data = response.data
        
        # For parallel signing, always allow
        if request_data.get('signing_order') != 'sequential':
            return {"can_sign": True, "message": "Parallel signing - you can sign now"}
        
        # Get all signers ordered by signing_order
        signers_response = get_supabase().table('signature_signers').select(
            '*'
        ).eq('request_id', body.request_id).order('signing_order').execute()
        
        if not signers_response.data:
            raise HTTPException(status_code=404, detail="No signers found")
        
        # Find current signer's position and check if all previous signers have signed
        signer_email_lower = body.signer_email.lower()
        current_signer_index = -1
        
        for i, signer in enumerate(signers_response.data):
            if signer.get('email', '').lower() == signer_email_lower:
                current_signer_index = i
                break
        
        if current_signer_index == -1:
            return {"can_sign": False, "message": "You are not a signer on this request"}
        
        # Check if all previous signers (with signer/approver role) have signed
        for i in range(current_signer_index):
            prev_signer = signers_response.data[i]
            if prev_signer.get('role') in ['signer', 'approver'] and prev_signer.get('status') != 'signed':
                prev_name = prev_signer.get('name', 'Another signer')
                return {
                    "can_sign": False,
                    "message": f"Please wait - {prev_name} needs to sign first",
                    "waiting_for": prev_name,
                    "waiting_for_email": prev_signer.get('email')
                }
        
        return {"can_sign": True, "message": "It's your turn to sign!"}
        
    except Exception as e:
        print(f"Error checking signer turn: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview-document/{request_id}")
async def preview_document(request_id: str):
    """
    Return the original document for preview in the PDF viewer.
    Creates a signed URL if the document is in storage:// format.
    """
    try:
        # Get the signature request details
        response = get_supabase().table('signature_requests').select(
            'document_url'
        ).eq('id', request_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Signature request not found")
        
        document_url = response.data.get('document_url')
        if not document_url:
            raise HTTPException(status_code=404, detail="No document attached to this request")
        
        # Handle storage:// format - create signed URL
        if document_url.startswith('storage://'):
            path = document_url.replace('storage://', '')
            parts = path.split('/', 1)
            if len(parts) == 2:
                bucket, file_path = parts
                signed_response = get_supabase().storage.from_(bucket).create_signed_url(
                    file_path, 
                    3600  # 1 hour expiry
                )
                if signed_response.get('signedURL'):
                    document_url = signed_response['signedURL']
                else:
                    raise HTTPException(status_code=500, detail="Failed to create signed URL")
        
        # Download the document
        async with httpx.AsyncClient() as client:
            doc_response = await client.get(document_url, timeout=30.0)
            doc_response.raise_for_status()
            
        # Return as PDF stream
        return StreamingResponse(
            io.BytesIO(doc_response.content),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=document_{request_id}.pdf",
                "Access-Control-Allow-Origin": "*"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error previewing document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-signed/{request_id}")
async def download_signed_pdf(request_id: str):
    """
    Generate and download a signed PDF with all signatures embedded on the document.
    If no PDF is attached, creates a signature certificate document.
    """
    try:
        print(f"Generating signed PDF for request: {request_id}")
        
        # Get the signature request details
        response = get_supabase().table('signature_requests').select(
            '*'
        ).eq('id', request_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Signature request not found")
        
        request_data = response.data
        
        # Get all signers for this request
        signers_response = get_supabase().table('signature_signers').select(
            '*'
        ).eq('request_id', request_id).order('signing_order').execute()
        
        signers = signers_response.data or []
        
        # Check if there's an original document URL
        document_url = request_data.get('document_url')
        
        # Determine file type from URL (handle query params in Supabase URLs)
        def get_file_extension(url: str) -> str:
            if not url:
                return ''
            # Remove query params, storage:// prefix, and get base path
            base_url = url.split('?')[0]
            if base_url.startswith('storage://'):
                base_url = base_url.replace('storage://', '')
            # Get extension
            if '.' in base_url:
                return base_url.rsplit('.', 1)[-1].lower()
            return ''
        
        # Handle storage:// format URLs OR public URLs - create signed URL for both
        async def get_downloadable_url(url: str) -> str:
            if not url:
                return url
                
            bucket = None
            file_path = None
            
            if url.startswith('storage://'):
                # Parse: storage://bucket/path
                path = url.replace('storage://', '')
                parts = path.split('/', 1)
                if len(parts) == 2:
                    bucket, file_path = parts
            elif '/storage/v1/object/public/' in url:
                # Parse old public URL format:
                # https://xxx.supabase.co/storage/v1/object/public/documents/user_id/file.pdf
                try:
                    # Extract everything after /public/
                    public_idx = url.index('/storage/v1/object/public/') + len('/storage/v1/object/public/')
                    path_part = url[public_idx:]
                    parts = path_part.split('/', 1)
                    if len(parts) == 2:
                        bucket, file_path = parts
                    print(f"🔄 Extracted from public URL: bucket={bucket}, path={file_path}")
                except Exception as e:
                    print(f"❌ Failed to parse public URL: {e}")
            
            if bucket and file_path:
                print(f"📁 Creating signed URL for bucket={bucket}, path={file_path}")
                # Create signed URL using Supabase client
                signed_response = get_supabase().storage.from_(bucket).create_signed_url(
                    file_path, 
                    3600  # 1 hour expiry
                )
                if signed_response.get('signedURL'):
                    print(f"✅ Signed URL created successfully")
                    return signed_response['signedURL']
                else:
                    print(f"❌ Failed to create signed URL: {signed_response}")
            
            return url  # Return original if can't create signed URL
        
        file_ext = get_file_extension(document_url) if document_url else ''
        is_pdf = file_ext == 'pdf'
        is_image = file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']
        
        print(f"Document URL: {document_url}")
        print(f"File extension: {file_ext}, is_pdf: {is_pdf}, is_image: {is_image}")
        
        if document_url and (is_pdf or is_image):
            # Get downloadable URL (handle storage:// format)
            download_url = await get_downloadable_url(document_url)
            print(f"📥 Downloading from: {download_url}")
            
            # Download the original document
            try:
                async with httpx.AsyncClient() as client:
                    doc_response = await client.get(download_url, timeout=30.0)
                    doc_response.raise_for_status()
                    doc_bytes = doc_response.content
                
                print(f"✅ Downloaded {len(doc_bytes)} bytes successfully")
                
                if is_pdf:
                    # Open the PDF with PyMuPDF
                    doc = fitz.open(stream=doc_bytes, filetype="pdf")
                else:
                    # For images, create a PDF with the image
                    doc = fitz.open()
                    # Determine page size from image
                    img = fitz.Pixmap(doc_bytes)
                    # Create page with image dimensions (convert pixels to points)
                    page_width = min(img.width * 0.75, 612)  # Max letter width
                    page_height = min(img.height * 0.75, 792)  # Max letter height
                    page = doc.new_page(width=page_width, height=page_height)
                    # Insert image
                    rect = page.rect
                    page.insert_image(rect, stream=doc_bytes)
                
            except Exception as e:
                print(f"Failed to download original document: {e}")
                import traceback
                traceback.print_exc()
                # Fall back to creating a certificate
                doc = create_signature_certificate_pdf(request_data, signers)
        else:
            # No document attached - create a signature certificate document
            doc = create_signature_certificate_pdf(request_data, signers)
        
        # Add signatures to the last page
        last_page = doc[-1]
        page_width = last_page.rect.width
        page_height = last_page.rect.height
        
        # Calculate signature positions
        signature_y_start = page_height - 200  # Start 200 points from bottom
        signature_width = 150
        signature_height = 50
        margin = 50
        
        # Add signatures section header
        last_page.insert_text(
            (margin, signature_y_start - 30),
            "ELECTRONIC SIGNATURES",
            fontsize=12,
            fontname="helv",
            color=(0, 0, 0)
        )
        
        # Add a line separator
        last_page.draw_line(
            (margin, signature_y_start - 20),
            (page_width - margin, signature_y_start - 20),
            color=(0.5, 0.5, 0.5),
            width=1
        )
        
        # Add each signature
        x_position = margin
        y_position = signature_y_start
        signatures_per_row = int((page_width - 2 * margin) / (signature_width + 20))
        current_col = 0
        
        for signer in signers:
            if signer.get('status') == 'signed' and signer.get('signature_data_url'):
                # Decode the signature image from data URL
                try:
                    data_url = signer['signature_data_url']
                    # Remove data URL prefix
                    if ',' in data_url:
                        base64_data = data_url.split(',')[1]
                    else:
                        base64_data = data_url
                    
                    signature_bytes = base64.b64decode(base64_data)
                    
                    # Check if custom position is specified
                    position = signer.get('signature_position')
                    
                    if position and isinstance(position, dict):
                        # Use custom position - get the target page
                        target_page_num = position.get('page', len(doc))  # Default to last page
                        target_page = doc[min(target_page_num - 1, len(doc) - 1)]  # 0-indexed, clamp to valid range
                        
                        target_page_width = target_page.rect.width
                        target_page_height = target_page.rect.height
                        
                        # Calculate position from percentages for responsive placement
                        sig_width = position.get('width', signature_width)
                        sig_height = position.get('height', signature_height)
                        
                        # Calculate actual x,y from percentages
                        sig_x = (position.get('xPercent', 50) / 100) * target_page_width - sig_width / 2
                        sig_y = (position.get('yPercent', 80) / 100) * target_page_height - sig_height / 2
                        
                        # Clamp to page bounds
                        sig_x = max(0, min(sig_x, target_page_width - sig_width))
                        sig_y = max(0, min(sig_y, target_page_height - sig_height))
                        
                        print(f"📍 Using custom position: page={target_page_num}, x={sig_x:.1f}, y={sig_y:.1f}")
                        
                        # Create signature rectangle at custom position
                        sig_rect = fitz.Rect(
                            sig_x,
                            sig_y,
                            sig_x + sig_width,
                            sig_y + sig_height
                        )
                        
                        # Insert signature image at custom position
                        target_page.insert_image(sig_rect, stream=signature_bytes)
                    else:
                        # Fall back to default position at bottom of last page
                        print(f"📍 Using default position: x={x_position:.1f}, y={y_position:.1f}")
                        
                        # Create signature rectangle
                        sig_rect = fitz.Rect(
                            x_position,
                            y_position,
                            x_position + signature_width,
                            y_position + signature_height
                        )
                        
                        # Insert signature image
                        last_page.insert_image(sig_rect, stream=signature_bytes)
                    
                    # Add signer name below signature
                    last_page.insert_text(
                        (x_position, y_position + signature_height + 12),
                        signer.get('name', 'Unknown'),
                        fontsize=8,
                        fontname="helv",
                        color=(0, 0, 0)
                    )
                    
                    # Add signing date
                    signed_at = signer.get('signed_at')
                    if signed_at:
                        try:
                            sign_date = datetime.fromisoformat(signed_at.replace('Z', '+00:00'))
                            date_str = sign_date.strftime('%Y-%m-%d %H:%M')
                        except:
                            date_str = signed_at[:10] if len(signed_at) >= 10 else signed_at
                        
                        last_page.insert_text(
                            (x_position, y_position + signature_height + 22),
                            f"Signed: {date_str}",
                            fontsize=6,
                            fontname="helv",
                            color=(0.5, 0.5, 0.5)
                        )
                    
                    # Move to next position
                    current_col += 1
                    if current_col >= signatures_per_row:
                        current_col = 0
                        x_position = margin
                        y_position += signature_height + 40
                    else:
                        x_position += signature_width + 20
                        
                except Exception as e:
                    print(f"Failed to add signature for {signer.get('name')}: {e}")
        
        # Save to bytes
        output_bytes = doc.write()
        doc.close()
        
        # Create filename
        safe_title = "".join(c for c in request_data.get('title', 'document') if c.isalnum() or c in (' ', '-', '_')).strip()
        filename = f"{safe_title}_signed.pdf"
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(output_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
        
    except Exception as e:
        print(f"Error generating signed PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def create_signature_certificate_pdf(request_data: dict, signers: list) -> fitz.Document:
    """
    Create a signature certificate PDF when no original document is attached.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)  # Letter size
    
    # Add header
    page.insert_text(
        (50, 60),
        "ELECTRONIC SIGNATURE CERTIFICATE",
        fontsize=18,
        fontname="helv",
        color=(0, 0.3, 0.6)
    )
    
    # Add completion badge
    status = request_data.get('status', 'pending')
    if status == 'completed':
        page.draw_rect(
            fitz.Rect(400, 40, 560, 70),
            color=(0, 0.6, 0.3),
            fill=(0.9, 1, 0.9),
            width=1
        )
        page.insert_text(
            (420, 60),
            "✓ COMPLETED",
            fontsize=12,
            fontname="helv",
            color=(0, 0.5, 0.2)
        )
    
    # Add document info section
    y = 100
    page.insert_text((50, y), "Document Information", fontsize=12, fontname="helv", color=(0, 0, 0))
    y += 20
    page.draw_line((50, y), (562, y), color=(0.8, 0.8, 0.8), width=1)
    
    y += 25
    info_items = [
        ("Title:", request_data.get('title', 'Untitled')),
        ("Document:", request_data.get('document_name', 'No document attached')),
        ("Request ID:", request_data.get('id', 'N/A')[:36]),
        ("Created:", request_data.get('created_at', 'N/A')[:10] if request_data.get('created_at') else 'N/A'),
        ("Completed:", request_data.get('completed_at', 'Pending')[:10] if request_data.get('completed_at') else 'Pending'),
    ]
    
    for label, value in info_items:
        page.insert_text((50, y), label, fontsize=10, fontname="helv", color=(0.4, 0.4, 0.4))
        page.insert_text((150, y), str(value), fontsize=10, fontname="helv", color=(0, 0, 0))
        y += 18
    
    # Add message if present
    if request_data.get('message'):
        y += 10
        page.insert_text((50, y), "Message:", fontsize=10, fontname="helv", color=(0.4, 0.4, 0.4))
        y += 15
        # Wrap long messages
        message = request_data.get('message', '')[:500]
        page.insert_textbox(
            fitz.Rect(50, y, 562, y + 50),
            message,
            fontsize=10,
            fontname="helv",
            color=(0, 0, 0)
        )
        y += 60
    
    # Add signers section
    y += 20
    page.insert_text((50, y), "Signers", fontsize=12, fontname="helv", color=(0, 0, 0))
    y += 20
    page.draw_line((50, y), (562, y), color=(0.8, 0.8, 0.8), width=1)
    y += 20
    
    for signer in signers:
        name = signer.get('name', 'Unknown')
        email = signer.get('email', '')
        role = signer.get('role', 'signer').capitalize()
        status = signer.get('status', 'pending')
        signed_at = signer.get('signed_at', '')
        
        # Status indicator
        if status == 'signed':
            status_color = (0, 0.5, 0.2)
            status_text = "✓ Signed"
        else:
            status_color = (0.8, 0.6, 0)
            status_text = "○ Pending"
        
        page.insert_text((50, y), f"{name} ({role})", fontsize=10, fontname="helv", color=(0, 0, 0))
        page.insert_text((400, y), status_text, fontsize=10, fontname="helv", color=status_color)
        y += 15
        page.insert_text((50, y), email, fontsize=8, fontname="helv", color=(0.5, 0.5, 0.5))
        if signed_at:
            page.insert_text((400, y), signed_at[:19].replace('T', ' '), fontsize=8, fontname="helv", color=(0.5, 0.5, 0.5))
        y += 25
    
    # Add footer
    page.insert_text(
        (50, 750),
        "This is an electronically signed document. All parties have consented to conduct this transaction electronically.",
        fontsize=8,
        fontname="helv",
        color=(0.5, 0.5, 0.5)
    )
    
    return doc

