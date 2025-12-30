"""
Watermark Service - Apply watermarks to PDF documents
"""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from PyPDF2 import PdfReader, PdfWriter
import io
from pathlib import Path


def create_watermark_overlay(text: str, font_family: str = "Helvetica", 
                            font_size: int = 48, rotation: int = -45,
                            opacity: float = 0.3, color: tuple = (0, 0, 0)):
    """
    Create a watermark overlay PDF
    
    Args:
        text: Watermark text
        font_family: Font name (Helvetica, Times-Roman, Courier)
        font_size: Font size in points
        rotation: Rotation angle in degrees
        opacity: Opacity (0.0 to 1.0)
        color: RGB color tuple (0-1 range)
    
    Returns:
        BytesIO object containing watermark PDF
    """
    # Map web fonts to ReportLab standard fonts
    font_mapping = {
        'arial': 'Helvetica',
        'times new roman': 'Times-Roman',
        'courier new': 'Courier',
        'georgia': 'Times-Roman',
        'verdana': 'Helvetica',
        'helvetica': 'Helvetica',
        'times-roman': 'Times-Roman',
        'courier': 'Courier',
    }
    
    # Get mapped font (case-insensitive)
    mapped_font = font_mapping.get(font_family.lower(), 'Helvetica')
    
    packet = io.BytesIO()
    
    # Create canvas with letter size
    can = canvas.Canvas(packet, pagesize=letter)
    width, height = letter
    
    # Set opacity
    can.setFillColorRGB(color[0], color[1], color[2], alpha=opacity)
    
    # Set font with safe fallback
    try:
        can.setFont(mapped_font, font_size)
    except:
        can.setFont("Helvetica", font_size)
        mapped_font = "Helvetica"
    
    # Position in center and rotate
    can.translate(width / 2, height / 2)
    can.rotate(rotation)
    
    # Draw text centered (use mapped_font for stringWidth)
    text_width = can.stringWidth(text, mapped_font, font_size)
    can.drawString(-text_width / 2, 0, text)
    
    can.save()
    packet.seek(0)
    return packet


def apply_watermark_to_pdf(pdf_path: str, watermark_text: str, 
                          output_path: str = None,
                          font_family: str = "Helvetica",
                          font_size: int = 48,
                          rotation: int = -45,
                          opacity: float = 0.3,
                          color_hex: str = "#000000") -> str:
    """
    Apply watermark to PDF file
    
    Args:
        pdf_path: Path to input PDF
        watermark_text: Text to watermark
        output_path: Path for output PDF (if None, appends '_watermarked')
        font_family: Font name
        font_size: Font size
        rotation: Rotation angle
        opacity: Opacity
        color_hex: Hex color code
    
    Returns:
        Path to watermarked PDF
    """
    # Convert hex color to RGB (0-1 range)
    color_hex = color_hex.lstrip('#')
    r, g, b = tuple(int(color_hex[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    
    # Create watermark overlay
    watermark_packet = create_watermark_overlay(
        watermark_text, font_family, font_size, rotation, opacity, (r, g, b)
    )
    watermark_pdf = PdfReader(watermark_packet)
    watermark_page = watermark_pdf.pages[0]
    
    # Read original PDF
    pdf_reader = PdfReader(pdf_path)
    pdf_writer = PdfWriter()
    
    # Apply watermark to each page
    for page in pdf_reader.pages:
        page.merge_page(watermark_page)
        pdf_writer.add_page(page)
    
    # Determine output path
    if output_path is None:
        pdf_path_obj = Path(pdf_path)
        output_path = str(pdf_path_obj.parent / f"{pdf_path_obj.stem}_watermarked{pdf_path_obj.suffix}")
    
    # Write output
    with open(output_path, 'wb') as output_file:
        pdf_writer.write(output_file)
    
    return output_path


def apply_tiled_watermark(pdf_path: str, watermark_text: str,
                         output_path: str = None,
                         font_family: str = "Helvetica",
                         font_size: int = 32,
                         rotation: int = -45,
                         opacity: float = 0.2,
                         color_hex: str = "#000000") -> str:
    """
    Apply tiled/repeated watermark pattern to PDF
    
    Args:
        pdf_path: Path to input PDF
        watermark_text: Text to watermark
        output_path: Path for output PDF
        font_family: Font name
        font_size: Font size
        rotation: Rotation angle
        opacity: Opacity
        color_hex: Hex color code
    
    Returns:
        Path to watermarked PDF
    """
    # Map web fonts to ReportLab standard fonts
    font_mapping = {
        'arial': 'Helvetica',
        'times new roman': 'Times-Roman',
        'courier new': 'Courier',
        'georgia': 'Times-Roman',
        'verdana': 'Helvetica',
        'helvetica': 'Helvetica',
        'times-roman': 'Times-Roman',
        'courier': 'Courier',
    }
    mapped_font = font_mapping.get(font_family.lower(), 'Helvetica')
    
    # Convert hex color to RGB
    color_hex = color_hex.lstrip('#')
    r, g, b = tuple(int(color_hex[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    
    # Create tiled watermark overlay
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=letter)
    width, height = letter
    
    can.setFillColorRGB(r, g, b, alpha=opacity)
    try:
        can.setFont(mapped_font, font_size)
    except:
        can.setFont("Helvetica", font_size)
    
    # Draw tiled pattern
    spacing = max(font_size * 3, 200)
    for x in range(-int(width), int(width * 2), int(spacing)):
        for y in range(-int(height), int(height * 2), int(spacing)):
            can.saveState()
            can.translate(x, y)
            can.rotate(rotation)
            can.drawString(0, 0, watermark_text)
            can.restoreState()
    
    can.save()
    packet.seek(0)
    
    watermark_pdf = PdfReader(packet)
    watermark_page = watermark_pdf.pages[0]
    
    # Apply to original PDF
    pdf_reader = PdfReader(pdf_path)
    pdf_writer = PdfWriter()
    
    for page in pdf_reader.pages:
        page.merge_page(watermark_page)
        pdf_writer.add_page(page)
    
    if output_path is None:
        pdf_path_obj = Path(pdf_path)
        output_path = str(pdf_path_obj.parent / f"{pdf_path_obj.stem}_watermarked{pdf_path_obj.suffix}")
    
    with open(output_path, 'wb') as output_file:
        pdf_writer.write(output_file)
    
    return output_path
