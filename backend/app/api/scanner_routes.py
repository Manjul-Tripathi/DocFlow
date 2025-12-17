"""
Scanner API routes for network scanner discovery and scanning operations
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scanner", tags=["scanner"])

# Request/Response Models
class VerifyScannerRequest(BaseModel):
    ipAddress: str

class ScannerInfo(BaseModel):
    name: str
    manufacturer: str
    model: str
    capabilities: Dict[str, Any]
    status: str

class VerifyScannerResponse(BaseModel):
    success: bool
    scanner: Optional[ScannerInfo] = None
    error: Optional[str] = None

class ScanRequest(BaseModel):
    ipAddress: str
    resolution: Optional[int] = 300
    colorMode: Optional[str] = "color"
    format: Optional[str] = "pdf"
    duplex: Optional[bool] = False

class DiscoverScannersRequest(BaseModel):
    subnet: Optional[str] = None  # e.g., "192.168.1"

class DiscoverScannersResponse(BaseModel):
    scanners: List[Dict[str, Any]]
    scanned_ips: int
    error: Optional[str] = None


@router.post("/verify", response_model=VerifyScannerResponse)
async def verify_scanner(request: VerifyScannerRequest):
    """
    Verify if a scanner exists at the given IP address by checking eSCL endpoint
    """
    ip = request.ipAddress
    
    # Common eSCL ports
    ports = [80, 443, 8080, 60000]
    
    async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
        for port in ports:
            try:
                # Try eSCL ScannerCapabilities endpoint
                url = f"http://{ip}:{port}/eSCL/ScannerCapabilities" if port != 443 else f"https://{ip}/eSCL/ScannerCapabilities"
                
                response = await client.get(url)
                
                if response.status_code == 200:
                    # Parse scanner info from XML response
                    scanner_info = parse_escl_capabilities(response.text, ip, port)
                    return VerifyScannerResponse(
                        success=True,
                        scanner=scanner_info
                    )
            except Exception as e:
                logger.debug(f"Failed to check {ip}:{port} - {e}")
                continue
    
    # If we get here, scanner wasn't found but we'll still add it
    # The user knows their scanner's IP, trust them
    return VerifyScannerResponse(
        success=True,
        scanner=ScannerInfo(
            name=f"Network Scanner ({ip})",
            manufacturer="Unknown",
            model="Network Scanner",
            capabilities={
                "maxResolution": 600,
                "colorModes": ["color", "grayscale"],
                "paperSizes": ["A4", "Letter"],
                "duplex": False,
                "adf": True
            },
            status="online"
        ),
        error="Could not auto-detect scanner info, using default settings"
    )


@router.post("/discover", response_model=DiscoverScannersResponse)
async def discover_scanners(request: DiscoverScannersRequest):
    """
    Discover scanners on the network by scanning subnet
    """
    subnet = request.subnet
    
    if not subnet:
        # Try to detect local subnet
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            subnet = ".".join(local_ip.split(".")[:-1])
        except:
            return DiscoverScannersResponse(
                scanners=[],
                scanned_ips=0,
                error="Could not determine local subnet"
            )
    
    scanners = []
    scanned = 0
    
    # Scan common printer IP ranges (1-254, but focus on common ranges)
    common_ranges = list(range(1, 50)) + list(range(100, 150)) + list(range(200, 255))
    
    async with httpx.AsyncClient(timeout=2.0, verify=False) as client:
        tasks = []
        for i in common_ranges:
            ip = f"{subnet}.{i}"
            tasks.append(check_scanner_at_ip(client, ip))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            scanned += 1
            if isinstance(result, dict) and result.get("found"):
                scanners.append(result["scanner"])
    
    return DiscoverScannersResponse(
        scanners=scanners,
        scanned_ips=scanned,
        error=None if scanners else "No scanners found on network"
    )


async def check_scanner_at_ip(client: httpx.AsyncClient, ip: str) -> Dict[str, Any]:
    """Check if there's a scanner at the given IP"""
    ports = [80, 8080]  # Most common eSCL ports
    
    for port in ports:
        try:
            url = f"http://{ip}:{port}/eSCL/ScannerCapabilities"
            response = await client.get(url)
            
            if response.status_code == 200 and "ScannerCapabilities" in response.text:
                scanner_info = parse_escl_capabilities(response.text, ip, port)
                return {
                    "found": True,
                    "scanner": {
                        "id": f"network-{ip}",
                        "ipAddress": ip,
                        "port": port,
                        **scanner_info.dict()
                    }
                }
        except:
            pass
    
    return {"found": False}


def parse_escl_capabilities(xml_content: str, ip: str, port: int) -> ScannerInfo:
    """Parse eSCL ScannerCapabilities XML response"""
    import re
    
    # Extract scanner info from XML (basic parsing)
    name = f"Network Scanner ({ip})"
    manufacturer = "Unknown"
    model = "Network Scanner"
    
    # Try to extract make/model from XML
    make_match = re.search(r"<pwg:MakeAndModel>([^<]+)</pwg:MakeAndModel>", xml_content)
    if make_match:
        make_model = make_match.group(1)
        name = make_model
        parts = make_model.split(" ", 1)
        if len(parts) >= 1:
            manufacturer = parts[0]
        if len(parts) >= 2:
            model = parts[1]
    
    # Extract capabilities
    max_resolution = 600
    res_match = re.search(r"<scan:XResolution>(\d+)</scan:XResolution>", xml_content)
    if res_match:
        try:
            max_resolution = int(res_match.group(1))
        except:
            pass
    
    color_modes = ["color", "grayscale"]
    duplex = "Duplex" in xml_content or "ADF" in xml_content
    adf = "ADF" in xml_content or "Feeder" in xml_content
    
    return ScannerInfo(
        name=name,
        manufacturer=manufacturer,
        model=model,
        capabilities={
            "maxResolution": max_resolution,
            "colorModes": color_modes,
            "paperSizes": ["A4", "Letter", "Legal"],
            "duplex": duplex,
            "adf": adf
        },
        status="online"
    )


@router.post("/scan")
async def scan_document(request: ScanRequest):
    """
    Initiate a scan on a network scanner
    This endpoint acts as a proxy to bypass CORS restrictions
    """
    ip = request.ipAddress
    
    # Build eSCL scan job XML
    resolution = request.resolution or 300
    color_mode = "RGB24" if request.colorMode == "color" else "Grayscale8"
    
    scan_settings_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.0</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>3508</pwg:Height>
      <pwg:Width>2480</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <scan:DocumentFormat>application/pdf</scan:DocumentFormat>
  <scan:XResolution>{resolution}</scan:XResolution>
  <scan:YResolution>{resolution}</scan:YResolution>
  <scan:ColorMode>{color_mode}</scan:ColorMode>
  <scan:CompressionFactor>25</scan:CompressionFactor>
</scan:ScanSettings>'''
    
    try:
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            # Create scan job
            job_response = await client.post(
                f"http://{ip}/eSCL/ScanJobs",
                content=scan_settings_xml,
                headers={"Content-Type": "text/xml"}
            )
            
            if job_response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to create scan job: {job_response.status_code}"
                )
            
            # Get job location from headers
            location = job_response.headers.get("Location")
            if not location:
                raise HTTPException(
                    status_code=400,
                    detail="Scanner did not return job location"
                )
            
            # Wait for scan and download document
            await asyncio.sleep(3)  # Give scanner time to scan
            
            doc_url = f"{location}/NextDocument"
            doc_response = await client.get(doc_url)
            
            if doc_response.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to retrieve scanned document: {doc_response.status_code}"
                )
            
            # Return the scanned document
            from fastapi.responses import Response
            return Response(
                content=doc_response.content,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"attachment; filename=scan-{ip.replace('.', '-')}.pdf"
                }
            )
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=408,
            detail="Scanner timeout - make sure scanner is ready"
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to scanner at {ip}"
        )
    except Exception as e:
        logger.error(f"Scan error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Scanning failed: {str(e)}"
        )
