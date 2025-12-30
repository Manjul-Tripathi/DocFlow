"""AI Analysis Routes for document comparison and analysis."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import logging
import os
import json
import google.generativeai as genai
from datetime import datetime
from supabase import create_client, Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI Analysis"])

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Configure Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Supabase client initialized for AI routes")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured - comparison history will not be saved")


class AIAnalyzeRequest(BaseModel):
    prompt: str
    context: Optional[str] = "general"
    document_id: Optional[str] = None
    document_name: Optional[str] = None
    user_id: Optional[str] = None
    comparison_type: Optional[str] = "general"  # 'version', 'document', or 'ai'
    base_version: Optional[str] = None
    compare_version: Optional[str] = None
    base_version_id: Optional[str] = None
    compare_version_id: Optional[str] = None
    doc1_id: Optional[str] = None
    doc2_id: Optional[str] = None
    changes_count: Optional[int] = None
    comparison_data: Optional[Dict[str, Any]] = None
    

class AIAnalyzeResponse(BaseModel):
    analysis: str
    model: str
    context: str
    success: bool
    error: Optional[str] = None
    analysis_id: Optional[str] = None


class AnalysisHistoryItem(BaseModel):
    id: str
    document_id: Optional[str]
    document_name: str
    comparison_type: str
    base_version: str
    compare_version: str
    changes_count: int
    base_version_id: Optional[str]
    compare_version_id: Optional[str]
    doc1_id: Optional[str]
    doc2_id: Optional[str]
    comparison_data: Optional[Dict[str, Any]]
    has_ai_analysis: bool
    ai_analysis_text: Optional[str]
    ai_model_used: Optional[str]
    ai_context_type: Optional[str]
    created_at: str


@router.post("/analyze", response_model=AIAnalyzeResponse)
async def analyze_with_ai(request: AIAnalyzeRequest):
    """
    Analyze document changes or content using AI (Gemini).
    Saves the analysis to database for future retrieval.
    """
    try:
        # Check for existing analysis first (for version comparisons)
        if (supabase and request.user_id and request.comparison_type == "ai" 
            and request.base_version_id and request.compare_version_id):
            try:
                existing = supabase.table('comparison_history').select('*').eq(
                    'user_id', request.user_id
                ).eq('base_version_id', request.base_version_id).eq(
                    'compare_version_id', request.compare_version_id
                ).eq('comparison_type', 'ai').eq('has_ai_analysis', True).order(
                    'created_at', desc=True
                ).limit(1).execute()
                
                if existing.data and len(existing.data) > 0:
                    cached = existing.data[0]
                    logger.info(f"Returning cached AI analysis for versions {request.base_version_id} -> {request.compare_version_id}")
                    return AIAnalyzeResponse(
                        analysis=cached.get('ai_analysis_text', ''),
                        model=cached.get('ai_model_used', 'cached'),
                        context=cached.get('ai_context_type', request.context or "general"),
                        success=True,
                        analysis_id=cached['id']
                    )
            except Exception as e:
                logger.warning(f"Failed to check for existing analysis: {e}")
        
        if not GEMINI_API_KEY:
            # Return a fallback analysis if no API key
            analysis_text = generate_fallback_analysis(request.prompt, request.context)
            model_used = "fallback"
        else:
            # Use Gemini for analysis
            model = genai.GenerativeModel('gemini-2.5-flash')
            
            system_prompt = get_system_prompt(request.context)
            full_prompt = f"{system_prompt}\n\n{request.prompt}"
            
            response = model.generate_content(full_prompt)
            
            analysis_text = response.text if response.text else "Unable to generate analysis."
            model_used = "gemini-2.5-flash"
        
        # Save analysis to database
        analysis_id = None
        if supabase and request.user_id:
            try:
                analysis_data = {
                    'user_id': request.user_id,
                    'document_name': request.document_name or 'Unknown Document',
                    'comparison_type': request.comparison_type or "ai",
                    'base_version': request.base_version or 'v1.0',
                    'compare_version': request.compare_version or 'v2.0',
                    'changes_count': request.changes_count or 0,
                    'has_ai_analysis': True,
                    'ai_analysis_text': analysis_text,
                    'ai_model_used': model_used,
                    'ai_context_type': request.context or "general",
                }
                
                # Add optional fields
                if request.document_id:
                    analysis_data['document_id'] = request.document_id
                if request.base_version_id:
                    analysis_data['base_version_id'] = request.base_version_id
                if request.compare_version_id:
                    analysis_data['compare_version_id'] = request.compare_version_id
                if request.doc1_id:
                    analysis_data['doc1_id'] = request.doc1_id
                if request.doc2_id:
                    analysis_data['doc2_id'] = request.doc2_id
                if request.comparison_data:
                    analysis_data['comparison_data'] = request.comparison_data
                
                result = supabase.table('comparison_history').insert(analysis_data).execute()
                if result.data and len(result.data) > 0:
                    analysis_id = result.data[0].get('id')
                logger.info(f"Saved AI analysis result for user {request.user_id}")
            except Exception as e:
                logger.error(f"Failed to save analysis to database: {e}")
        
        return AIAnalyzeResponse(
            analysis=analysis_text,
            model=model_used,
            context=request.context or "general",
            success=True,
            analysis_id=analysis_id
        )
        
    except Exception as e:
        logger.error(f"AI analysis failed: {str(e)}")
        # Return fallback on error
        return AIAnalyzeResponse(
            analysis=generate_fallback_analysis(request.prompt, request.context),
            model="fallback",
            context=request.context or "general",
            success=True,
            error=str(e)
        )


def get_system_prompt(context: Optional[str]) -> str:
    """Get appropriate system prompt based on context."""
    if context == "document_comparison":
        return """You are a document analysis expert. Analyze the provided document comparison data and provide:
1. A clear executive summary of the changes
2. Key changes that might be significant for review
3. Any potential issues, concerns, or inconsistencies
4. Recommendations for the reviewer

Format your response with clear headers (using ##) and bullet points for easy reading."""
    
    elif context == "version_diff":
        return """You are a version control expert. Analyze the version differences and explain:
1. What changed between the versions
2. The significance of each change
3. Whether any changes might be breaking or need attention
4. A summary suitable for a changelog

Use markdown formatting for clarity."""
    
    else:
        return """You are a helpful AI assistant analyzing document content. 
Provide clear, structured analysis with actionable insights."""


def generate_fallback_analysis(prompt: str, context: Optional[str]) -> str:
    """Generate a basic analysis when AI is unavailable."""
    
    # Extract numbers from prompt if they exist
    import re
    numbers = re.findall(r'Added: (\d+)|Removed: (\d+)|Modified: (\d+)', prompt)
    
    added = modified = removed = 0
    for match in numbers:
        if match[0]: added = int(match[0])
        if match[1]: removed = int(match[1])
        if match[2]: modified = int(match[2])
    
    total_changes = added + removed + modified
    
    if context == "document_comparison":
        return f"""## Document Comparison Analysis

### Executive Summary
This analysis compares document changes with a total of **{total_changes}** modifications detected.

### Statistics Overview
- **{added}** additions: New content or fields added
- **{removed}** deletions: Content or fields removed
- **{modified}** modifications: Existing content changed

### Significance Assessment
{"⚠️ **High Change Volume**: With " + str(total_changes) + " changes, a thorough review is recommended." if total_changes > 20 else "✅ **Moderate Changes**: The number of changes appears manageable for review."}

### Recommendations
1. Review all modified sections to ensure accuracy
2. Verify that deletions were intentional
3. Validate new additions for consistency with existing content
4. Consider creating a backup before accepting changes

### Next Steps
- Compare side-by-side using the visual diff view
- Mark reviewed sections as approved
- Document any concerns for follow-up

*Note: For more detailed AI-powered analysis, configure the GEMINI_API_KEY environment variable.*"""

    return f"""## Analysis Summary

A total of **{total_changes}** changes were detected in this comparison.

### Breakdown
- Additions: {added}
- Removals: {removed}  
- Modifications: {modified}

### Recommendation
Review each change carefully before accepting or rejecting.

*Note: Enable AI analysis for more detailed insights.*"""


@router.get("/history/{user_id}", response_model=List[AnalysisHistoryItem])
async def get_analysis_history(user_id: str, limit: int = 50):
    """
    Get comparison history for a user (includes all comparisons and AI analyses).
    """
    try:
        if not supabase:
            raise HTTPException(status_code=503, detail="Database not available")
        
        response = supabase.table('comparison_history').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=True).limit(limit).execute()
        
        return response.data
        
    except Exception as e:
        logger.error(f"Failed to fetch comparison history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis/{analysis_id}", response_model=AnalysisHistoryItem)
async def get_analysis_by_id(analysis_id: str, user_id: str):
    """
    Get a specific comparison by ID.
    """
    try:
        if not supabase:
            raise HTTPException(status_code=503, detail="Database not available")
        
        response = supabase.table('comparison_history').select('*').eq(
            'id', analysis_id
        ).eq('user_id', user_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Comparison not found")
        
        return response.data
        
    except Exception as e:
        logger.error(f"Failed to fetch comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{comparison_id}")
async def delete_comparison_history(comparison_id: str, user_id: str):
    """
    Delete a specific comparison from history.
    """
    try:
        if not supabase:
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Delete the comparison (with user_id check for security)
        response = supabase.table('comparison_history').delete().eq(
            'id', comparison_id
        ).eq('user_id', user_id).execute()
        
        if response.data:
            logger.info(f"Deleted comparison {comparison_id} for user {user_id}")
            return {"success": True, "message": "Comparison deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Comparison not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/comparison", response_model=Optional[AnalysisHistoryItem])
async def get_comparison_analysis(
    user_id: str,
    base_version_id: Optional[str] = None,
    compare_version_id: Optional[str] = None,
    doc1_id: Optional[str] = None,
    doc2_id: Optional[str] = None
):
    """
    Get comparison for a specific version or document comparison.
    """
    try:
        if not supabase:
            return None
        
        query = supabase.table('comparison_history').select('*').eq('user_id', user_id)
        
        # Filter by comparison type
        if base_version_id and compare_version_id:
            query = query.eq('base_version_id', base_version_id).eq('compare_version_id', compare_version_id)
        elif doc1_id and doc2_id:
            query = query.eq('doc1_id', doc1_id).eq('doc2_id', doc2_id)
        else:
            return None
        
        response = query.order('created_at', desc=True).limit(1).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        
        return None
        
    except Exception as e:
        logger.error(f"Failed to fetch comparison: {e}")
        return None


class SaveComparisonRequest(BaseModel):
    user_id: str
    document_id: Optional[str] = None
    document_name: str
    comparison_type: str  # 'version' or 'document'
    base_version: str
    compare_version: str
    changes_count: int
    base_version_id: Optional[str] = None
    compare_version_id: Optional[str] = None
    doc1_id: Optional[str] = None
    doc2_id: Optional[str] = None
    comparison_data: Optional[Dict[str, Any]] = None


@router.post("/save-comparison")
async def save_comparison(request: SaveComparisonRequest):
    """
    Save a comparison to history (without AI analysis).
    """
    try:
        if not supabase:
            raise HTTPException(status_code=503, detail="Database not available")
        
        comparison_data = {
            'user_id': request.user_id,
            'document_name': request.document_name,
            'comparison_type': request.comparison_type,
            'base_version': request.base_version,
            'compare_version': request.compare_version,
            'changes_count': request.changes_count,
            'has_ai_analysis': False,
        }
        
        # Add optional fields
        if request.document_id:
            comparison_data['document_id'] = request.document_id
        if request.base_version_id:
            comparison_data['base_version_id'] = request.base_version_id
        if request.compare_version_id:
            comparison_data['compare_version_id'] = request.compare_version_id
        if request.doc1_id:
            comparison_data['doc1_id'] = request.doc1_id
        if request.doc2_id:
            comparison_data['doc2_id'] = request.doc2_id
        if request.comparison_data:
            comparison_data['comparison_data'] = request.comparison_data
        
        result = supabase.table('comparison_history').insert(comparison_data).execute()
        
        if result.data and len(result.data) > 0:
            return {"success": True, "id": result.data[0].get('id'), "message": "Comparison saved"}
        
        return {"success": False, "message": "Failed to save comparison"}
        
    except Exception as e:
        logger.error(f"Failed to save comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class VersionCompareRequest(BaseModel):
    version1_id: str
    version2_id: str
    user_id: str


@router.post("/compare-versions")
async def compare_versions(request: VersionCompareRequest):
    """
    Compare two document versions using structured analysis when available,
    falling back to text comparison for non-structured content.
    """
    try:
        if not supabase:
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Import the comparison service
        from ..services.modules.version_comparison_service import VersionComparisonService
        
        # Fetch both versions
        version1_result = supabase.table('document_versions').select('*').eq('id', request.version1_id).single().execute()
        version2_result = supabase.table('document_versions').select('*').eq('id', request.version2_id).single().execute()
        
        if not version1_result.data or not version2_result.data:
            raise HTTPException(status_code=404, detail="Version not found")
        
        version1 = version1_result.data
        version2 = version2_result.data
        
        # Verify user has access to these versions
        doc1_result = supabase.table('documents').select('user_id').eq('id', version1['document_id']).single().execute()
        doc2_result = supabase.table('documents').select('user_id').eq('id', version2['document_id']).single().execute()
        
        if (doc1_result.data and doc1_result.data['user_id'] != request.user_id) or \
           (doc2_result.data and doc2_result.data['user_id'] != request.user_id):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Perform comparison using the new service
        comparison_result = VersionComparisonService.compare_versions(
            version1['content'], version2['content']
        )
        
        # Add version metadata to result
        comparison_result.update({
            "version1": {
                "id": version1['id'],
                "version_number": version1['version_number'],
                "change_summary": version1.get('change_summary', ''),
                "created_at": version1.get('created_at', '')
            },
            "version2": {
                "id": version2['id'],
                "version_number": version2['version_number'],
                "change_summary": version2.get('change_summary', ''),
                "created_at": version2.get('created_at', '')
            }
        })
        
        return {
            "success": True,
            "comparison": comparison_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compare versions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{comparison_id}")
async def delete_comparison(comparison_id: str, user_id: str):
    """
    Delete a comparison from history.
    """
    try:
        if not supabase:
            raise HTTPException(status_code=503, detail="Database not available")
        
        result = supabase.table('comparison_history').delete().eq(
            'id', comparison_id
        ).eq('user_id', user_id).execute()
        
        return {"success": True, "message": "Comparison deleted"}
        
    except Exception as e:
        logger.error(f"Failed to delete comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def ai_health_check():
    """Check if AI service is available."""
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "model": "gemini-2.0-flash" if GEMINI_API_KEY else "fallback"
    }
