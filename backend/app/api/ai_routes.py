"""AI Analysis Routes for document comparison and analysis."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
import os
import google.generativeai as genai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI Analysis"])

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


class AIAnalyzeRequest(BaseModel):
    prompt: str
    context: Optional[str] = "general"
    document_id: Optional[str] = None
    

class AIAnalyzeResponse(BaseModel):
    analysis: str
    model: str
    context: str
    success: bool
    error: Optional[str] = None


@router.post("/analyze", response_model=AIAnalyzeResponse)
async def analyze_with_ai(request: AIAnalyzeRequest):
    """
    Analyze document changes or content using AI (Gemini).
    """
    try:
        if not GEMINI_API_KEY:
            # Return a fallback analysis if no API key
            return AIAnalyzeResponse(
                analysis=generate_fallback_analysis(request.prompt, request.context),
                model="fallback",
                context=request.context or "general",
                success=True
            )
        
        # Use Gemini for analysis
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        system_prompt = get_system_prompt(request.context)
        full_prompt = f"{system_prompt}\n\n{request.prompt}"
        
        response = model.generate_content(full_prompt)
        
        analysis_text = response.text if response.text else "Unable to generate analysis."
        
        return AIAnalyzeResponse(
            analysis=analysis_text,
            model="gemini-1.5-flash",
            context=request.context or "general",
            success=True
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


@router.get("/health")
async def ai_health_check():
    """Check if AI service is available."""
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "model": "gemini-1.5-flash" if GEMINI_API_KEY else "fallback"
    }
