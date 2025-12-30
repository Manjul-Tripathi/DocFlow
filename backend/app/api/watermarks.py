"""
Watermark API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import Optional
import os
import tempfile
import uuid
from pathlib import Path
from datetime import datetime

from app.services.watermark_service import apply_watermark_to_pdf, apply_tiled_watermark
from app.core.supabase_client import get_supabase_client

router = APIRouter(prefix="/api/watermarks", tags=["watermarks"])


class ApplyWatermarkRequest(BaseModel):
    document_id: str
    watermark_text: str
    font_family: str = "Helvetica"
    font_size: int = 48
    rotation: int = -45
    opacity: float = 0.3
    color: str = "#000000"
    position: str = "center"  # center or tile
    save_to_documents: bool = True  # Save watermarked doc as new document


@router.post("/apply")
async def apply_watermark(request: ApplyWatermarkRequest):
    """
    Apply watermark to a PDF document
    
    If save_to_documents is True, saves the watermarked PDF as a new document.
    Returns JSON with new document info.
    """
    try:
        supabase = get_supabase_client()
        
        # Get document from database
        result = supabase.table('documents').select('*').eq('id', request.document_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = result.data
        user_id = document.get('user_id')
        
        # Download PDF from storage
        storage_path = document.get('storage_path')
        if not storage_path:
            raise HTTPException(status_code=400, detail="Document has no storage path")
        
        # Get file from Supabase storage
        file_data = supabase.storage.from_('documents').download(storage_path)
        
        # Save to temp file
        temp_input = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        temp_input.write(file_data)
        temp_input.close()
        
        # Create temp output file
        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='_watermarked.pdf')
        temp_output.close()
        
        # Apply watermark
        if request.position == "tile":
            output_path = apply_tiled_watermark(
                pdf_path=temp_input.name,
                watermark_text=request.watermark_text,
                output_path=temp_output.name,
                font_family=request.font_family,
                font_size=request.font_size,
                rotation=request.rotation,
                opacity=request.opacity,
                color_hex=request.color
            )
        else:
            output_path = apply_watermark_to_pdf(
                pdf_path=temp_input.name,
                watermark_text=request.watermark_text,
                output_path=temp_output.name,
                font_family=request.font_family,
                font_size=request.font_size,
                rotation=request.rotation,
                opacity=request.opacity,
                color_hex=request.color
            )
        
        # Clean up input file
        os.unlink(temp_input.name)
        
        # Read watermarked file
        with open(output_path, 'rb') as f:
            watermarked_data = f.read()
        
        # Generate new filename
        original_name = Path(document['file_name']).stem
        new_file_name = f"{original_name}_watermarked.pdf"
        
        if request.save_to_documents:
            # Upload to Supabase storage
            new_storage_path = f"{user_id}/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{new_file_name}"
            
            upload_result = supabase.storage.from_('documents').upload(
                new_storage_path,
                watermarked_data,
                file_options={"content-type": "application/pdf"}
            )
            
            # Create new document record (only use existing columns)
            new_doc_data = {
                'user_id': user_id,
                'file_name': new_file_name,
                'file_type': 'application/pdf',
                'file_size': len(watermarked_data),
                'storage_path': new_storage_path,
                'metadata': {
                    'is_watermarked': True,
                    'watermark_text': request.watermark_text,
                    'parent_document_id': request.document_id,
                    'watermark_settings': {
                        'text': request.watermark_text,
                        'font_family': request.font_family,
                        'font_size': request.font_size,
                        'rotation': request.rotation,
                        'opacity': request.opacity,
                        'color': request.color,
                        'position': request.position
                    },
                    'created_from': document['file_name']
                }
            }
            
            doc_result = supabase.table('documents').insert(new_doc_data).execute()
            
            # Clean up temp files
            os.unlink(output_path)
            
            new_doc = doc_result.data[0] if doc_result.data else None
            
            return JSONResponse({
                'success': True,
                'message': 'Watermarked PDF saved to documents',
                'document_id': new_doc['id'] if new_doc else None,
                'file_name': new_file_name,
                'storage_path': new_storage_path
            })
        else:
            # Just return the file for download (legacy behavior)
            return FileResponse(
                output_path,
                media_type='application/pdf',
                filename=new_file_name,
                background=BackgroundTask(os.unlink, output_path)
            )
        
    except Exception as e:
        print(f"Error applying watermark: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ApplyWatermarkToUrlRequest(BaseModel):
    document_url: str
    watermark_text: str = "CONFIDENTIAL"
    font_family: str = "Helvetica"
    font_size: int = 48
    rotation: int = -45
    opacity: float = 0.3
    color: str = "#888888"
    position: str = "tile"  # center or tile


@router.post("/apply-to-url")
async def apply_watermark_to_url(request: ApplyWatermarkToUrlRequest):
    """
    Apply watermark to a PDF from a URL (for guest/share link downloads)
    
    Downloads the PDF from the URL, applies watermark, and returns the watermarked PDF.
    """
    import httpx
    
    try:
        # Download PDF from URL
        async with httpx.AsyncClient() as client:
            response = await client.get(request.document_url, timeout=60.0)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to download PDF: {response.status_code}")
            
            pdf_data = response.content
        
        # Check if it's actually a PDF
        if not pdf_data.startswith(b'%PDF'):
            raise HTTPException(status_code=400, detail="The URL does not point to a valid PDF file")
        
        # Save to temp file
        temp_input = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        temp_input.write(pdf_data)
        temp_input.close()
        
        # Create temp output file
        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='_watermarked.pdf')
        temp_output.close()
        
        # Apply watermark
        if request.position == "tile":
            output_path = apply_tiled_watermark(
                pdf_path=temp_input.name,
                watermark_text=request.watermark_text,
                output_path=temp_output.name,
                font_family=request.font_family,
                font_size=request.font_size,
                rotation=request.rotation,
                opacity=request.opacity,
                color_hex=request.color
            )
        else:
            output_path = apply_watermark_to_pdf(
                pdf_path=temp_input.name,
                watermark_text=request.watermark_text,
                output_path=temp_output.name,
                font_family=request.font_family,
                font_size=request.font_size,
                rotation=request.rotation,
                opacity=request.opacity,
                color_hex=request.color
            )
        
        # Clean up input file
        os.unlink(temp_input.name)
        
        # Return watermarked PDF as download
        return FileResponse(
            output_path,
            media_type='application/pdf',
            filename='document_watermarked.pdf',
            background=BackgroundTask(os.unlink, output_path)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error applying watermark to URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))
