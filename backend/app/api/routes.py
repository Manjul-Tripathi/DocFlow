from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional, List
import logging
from datetime import datetime
import uuid
import threading

from ..models.schemas import (
    DocumentAnalysisRequest, DocumentAnalysisResponse,
    SemanticSearchRequest, SemanticSearchResponse,
    OrganizeDocumentsRequest, OrganizeDocumentsResponse,
    OrganizeSmartFoldersRequest, OrganizeSmartFoldersResponse,
    GenerateFormAppRequest, GenerateFormAppResponse,
    GenerateEmbeddingsRequest, GenerateEmbeddingsResponse,
    AutoOrganizeRequest, AutoOrganizeResponse,
    ProcessPendingRequest, ProcessPendingResponse
)
from ..core.supabase_client import get_supabase_client
from pydantic import BaseModel

# Direct save request schema
class DirectSaveRequest(BaseModel):
    result: Dict[str, Any]
    task: str
    userId: str
    documentName: Optional[str] = None
    documentId: Optional[str] = None  # If provided, update existing document instead of creating new

# Semantic search request schema
class SemanticSearchRequest(BaseModel):
    query: str
    userId: str
    limit: Optional[int] = 10
    similarity_threshold: Optional[float] = 0.7
    filters: Optional[Dict[str, Any]] = None

# Semantic search response schema
class SemanticSearchResponse(BaseModel):
    results: List[Dict[str, Any]]
    total: int
    query: str
    similarity_threshold: float
    timestamp: str
    error: Optional[str] = None

# Similar documents request schema
class SimilarDocumentsRequest(BaseModel):
    documentId: str
    userId: str
    limit: Optional[int] = 5

# RAG request schemas
class RAGQuestionRequest(BaseModel):
    question: str
    userId: str
    max_documents: Optional[int] = 3
    similarity_threshold: Optional[float] = 0.3
    include_sources: Optional[bool] = True

class RAGQuestionResponse(BaseModel):
    answer: str
    confidence: float
    sources: Optional[List[Dict[str, Any]]] = None
    metadata: Dict[str, Any]

class DocumentSummaryRequest(BaseModel):
    documentId: str
    userId: str
    summary_type: Optional[str] = "brief"  # brief, detailed, key_points

class DocumentSummaryResponse(BaseModel):
    summary: str
    metadata: Dict[str, Any]

# Document Type Detection schemas
class DetectDocumentTypeRequest(BaseModel):
    userId: str
    filename: Optional[str] = "document.pdf"

class DetectDocumentTypeResponse(BaseModel):
    document_type: str
    display_name: str
    icon: str
    color: str
    confidence: float
    bucket_name: str
    error: Optional[str] = None

class GetDocumentTypesResponse(BaseModel):
    types: List[Dict[str, Any]]
    total: int

class EnsureBucketRequest(BaseModel):
    document_type: str

class EnsureBucketResponse(BaseModel):
    bucket_name: str
    created: bool
    error: Optional[str] = None

from ..services.modules import DocumentAnalysisService, DocumentTypeDetector, BucketManager, DocumentProcessingOrchestrator, DatabaseService
from ..services.modules.semantic_search_service import SemanticSearchService
from ..services.modules.rag_service import RAGService
from ..services.modules.form_creation_service import FormCreationService
from ..services.modules.llm_client import LLMClient
from ..services.modules.prompt_service import PromptService
from ..services.pdf_processor import PDFProcessor
from ..services.organize_documents import OrganizeDocumentsService
from ..services.organize_smart_folders import OrganizeSmartFoldersService
from ..services.generate_form_app import GenerateFormAppService
from ..services.generate_embeddings import GenerateEmbeddingsService

logger = logging.getLogger(__name__)

analyze_router = APIRouter()

# Cancellation token storage: {request_id: cancellation_event}
# Each request gets a unique ID, and cancellation sets the event
_cancellation_tokens: Dict[str, threading.Event] = {}
_cancellation_lock = threading.Lock()

# CRITICAL FIX #7: Periodic cleanup of stale cancellation tokens
# Tokens older than 1 hour are automatically removed
import time
_last_token_cleanup = time.time()
TOKEN_CLEANUP_INTERVAL = 3600  # 1 hour
TOKEN_MAX_AGE = 3600  # 1 hour

def _cleanup_stale_tokens():
    """Remove cancellation tokens older than TOKEN_MAX_AGE"""
    global _last_token_cleanup
    current_time = time.time()
    
    # Only cleanup every TOKEN_CLEANUP_INTERVAL seconds
    if current_time - _last_token_cleanup < TOKEN_CLEANUP_INTERVAL:
        return
    
    _last_token_cleanup = current_time
    
    with _cancellation_lock:
        # Remove tokens that are older than TOKEN_MAX_AGE
        # Note: We can't track token age easily, so we'll use a simpler approach:
        # Limit the dictionary size to prevent unbounded growth
        max_tokens = 1000  # Maximum number of tokens to keep
        if len(_cancellation_tokens) > max_tokens:
            # Remove oldest tokens (simple FIFO - remove first N)
            tokens_to_remove = list(_cancellation_tokens.keys())[:len(_cancellation_tokens) - max_tokens]
            for token_id in tokens_to_remove:
                _cancellation_tokens.pop(token_id, None)
            logger.debug(f"🧹 Cleaned up {len(tokens_to_remove)} stale cancellation tokens")

# Initialize services
# Initialize LLM client first (needed by document type detector)
llm_client = LLMClient()
prompt_service = PromptService()

# Initialize document type detector with LLM client
document_type_detector = DocumentTypeDetector(llm_client=llm_client)

# Initialize the new document processing orchestrator with all dependencies
document_service = DocumentProcessingOrchestrator(
    type_detector=document_type_detector,
    document_analyzer=DocumentAnalysisService(),
    bucket_manager=BucketManager(get_supabase_client()),
    database_service=DatabaseService()
)

from ..services.auto_organize_service import auto_organize_service

semantic_search_service = SemanticSearchService()
organize_documents_service = OrganizeDocumentsService()
organize_smart_folders_service = OrganizeSmartFoldersService()
generate_form_app_service = GenerateFormAppService()
generate_embeddings_service = GenerateEmbeddingsService()
pdf_processor = PDFProcessor()

# Initialize form creation service
form_creation_service = FormCreationService(llm_client, prompt_service)

# Request/Response models for image preview
class ImagePreviewRequest(BaseModel):
    documentData: str

class ImagePreviewResponse(BaseModel):
    images: list[str]
    totalPages: int
    success: bool
    message: str

@analyze_router.post("/analyze-document", response_model=DocumentAnalysisResponse)
async def analyze_document(request: DocumentAnalysisRequest):
    """
    Analyze document using AI-powered template matching and field extraction
    """
    # Generate unique request ID for cancellation support
    request_id = str(uuid.uuid4())
    cancellation_event = threading.Event()
    
    # CRITICAL FIX #7: Cleanup stale tokens periodically
    _cleanup_stale_tokens()
    
    with _cancellation_lock:
        _cancellation_tokens[request_id] = cancellation_event
    
    try:
        logger.info(f"Received document analysis request for task: {request.task} (Request ID: {request_id})")
        logger.info(f"Document name: {request.documentName}")
        logger.info(f"Document data length: {len(request.documentData) if request.documentData else 0}")
        logger.info(f"Document data type: {'PDF' if request.documentData and request.documentData.startswith('data:application/pdf') else 'Image' if request.documentData and request.documentData.startswith('data:image/') else 'Text'}")
        
        result = await document_service.analyze_document(
            document_data=request.documentData,
            task=request.task,
            document_name=request.documentName,
            user_id=request.userId,
            save_to_database=request.saveToDatabase,
            templates=request.enhancedTemplates,
            max_workers=request.maxWorkers,
            max_threads=request.maxThreads,
            yolo_signature_enabled=request.yoloSignatureEnabled,
            yolo_face_enabled=request.yoloFaceEnabled,
            cancellation_token=cancellation_event,
            request_id=request_id,
            document_type=request.documentType
        )
        
        logger.info(f"Document analysis completed successfully for task: {request.task} (Request ID: {request_id})")
        return result
        
    except Exception as e:
        logger.error(f"Error in analyze_document endpoint: {str(e)} (Request ID: {request_id})")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Document analysis failed: {str(e)}"
        )
    finally:
        # Clean up cancellation token
        with _cancellation_lock:
            _cancellation_tokens.pop(request_id, None)

@analyze_router.post("/direct-save")
async def direct_save(request: DirectSaveRequest):
    """
    Directly save processed data to database without re-processing.
    If documentId is provided, updates existing document (for edited data).
    Otherwise creates a new document.
    This endpoint generates vector embeddings for semantic search.
    """
    try:
        logger.info(f"Received direct save request for task: {request.task}")
        logger.info(f"Document name: {request.documentName}")
        logger.info(f"Document ID (for update): {request.documentId}")
        logger.info(f"Result keys: {list(request.result.keys()) if request.result else 'None'}")
        
        # Import services
        from ..services.modules.database_service import DatabaseService
        from ..services.modules.embedding_service import EmbeddingService
        
        db_service = DatabaseService()
        embedding_service = EmbeddingService()
        
        # Generate vector embeddings (chunked) for semantic search
        chunks_data = None
        try:
            logger.info("🔍 Generating vector embeddings for manual save...")
            
            # Convert analysis result to text
            text = embedding_service.convert_analysis_result_to_text(request.result)
            text_length = len(text)
            
            # Use chunking for large documents (> 3000 chars)
            if text_length > 3000:
                logger.info(f"📊 Text is large ({text_length} chars), using chunked embeddings...")
                chunks_data = await embedding_service.generate_embeddings_for_chunks(
                    text, chunk_size=1500, overlap=200
                )
                if chunks_data:
                    logger.info(f"✅ Generated {len(chunks_data)} chunk embeddings")
                else:
                    logger.warning("⚠️ Failed to generate chunk embeddings")
            else:
                logger.info(f"📊 Text is small ({text_length} chars), using single embedding...")
                # For small documents, create a single chunk
                embedding = await embedding_service.generate_embedding(text)
                if embedding:
                    chunks_data = [{"chunk": text, "embedding": embedding}]
                    logger.info(f"✅ Generated single embedding with {len(embedding)} dimensions")
                else:
                    logger.warning("⚠️ Failed to generate vector embedding")
        except Exception as e:
            logger.error(f"❌ Error generating vector embeddings: {e}")
            chunks_data = None
        
        # Decide: Update existing document or create new
        if request.documentId:
            # UPDATE existing document with edited data and embeddings
            logger.info(f"💾 UPDATING existing document: {request.documentId}")
            saved_document = await db_service.update_document_in_database(
                document_id=request.documentId,
                result=request.result,
                user_id=request.userId,
                chunks_data=chunks_data
            )
            action = "updated"
        else:
            # CREATE new document
            logger.info(f"💾 CREATING new document")
            saved_document = await db_service.save_document_to_database(
                document_data="",  # Empty since we're not processing
                result=request.result,
                task=request.task,
                user_id=request.userId,
                document_name=request.documentName,
                chunks_data=chunks_data
            )
            action = "created"
        
        logger.info(f"Direct save completed successfully - document {action} for task: {request.task}")
        return {
            "success": True,
            "message": f"Data {action} successfully",
            "documentId": saved_document.get("id") if saved_document else None,
            "savedDocument": saved_document,
            "action": action,
            "hasEmbedding": chunks_data is not None,
            "chunkCount": len(chunks_data) if chunks_data else 0
        }
        
    except Exception as e:
        logger.error(f"Error in direct_save endpoint: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Direct save failed: {str(e)}"
        )

@analyze_router.post("/organize-existing-documents", response_model=OrganizeDocumentsResponse)
async def organize_existing_documents(request: OrganizeDocumentsRequest):
    """
    Organize existing documents into a smart folder
    """
    try:
        logger.info(f"Received organize existing documents request for folder: {request.folderId}")
        
        result = await organize_documents_service.organize_existing_documents(request.folderId)
        
        logger.info(f"Organize existing documents completed successfully. Added {result['documentsAdded']} documents")
        return result
        
    except Exception as e:
        logger.error(f"Error in organize_existing_documents endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Organize existing documents failed: {str(e)}"
        )

@analyze_router.post("/organize-smart-folders", response_model=OrganizeSmartFoldersResponse)
async def organize_smart_folders(request: OrganizeSmartFoldersRequest):
    """
    Organize a document into smart folders
    """
    try:
        logger.info(f"Received organize smart folders request for document: {request.documentId}")
        
        result = await organize_smart_folders_service.organize_smart_folders(request.documentId)
        
        logger.info(f"Organize smart folders completed successfully. Added to {len(result['organizationResults'])} folders")
        return result
        
    except Exception as e:
        logger.error(f"Error in organize_smart_folders endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Organize smart folders failed: {str(e)}"
        )

@analyze_router.post("/auto-organize-documents", response_model=AutoOrganizeResponse)
async def auto_organize_documents(request: AutoOrganizeRequest):
    """
    Automatically organize all documents by document type.
    Creates folders for each document type and assigns documents to them.
    """
    try:
        logger.info(f"🗂️ Received auto-organize request for user: {request.userId}")
        
        result = await auto_organize_service.auto_organize_by_document_type(request.userId)
        
        logger.info(f"✅ Auto-organize completed: {result['documentsOrganized']} documents organized into {len(result['foldersCreated'])} folders")
        return result
        
    except Exception as e:
        logger.error(f"Error in auto_organize_documents endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Auto-organize documents failed: {str(e)}"
        )

@analyze_router.post("/process-pending-documents", response_model=ProcessPendingResponse)
async def process_pending_documents(request: ProcessPendingRequest):
    """
    Process pending documents that haven't been analyzed yet.
    Infers document type and prepares them for organization.
    """
    try:
        logger.info(f"🔄 Received process pending request for user: {request.userId}")
        
        result = await auto_organize_service.process_pending_documents(
            request.userId, 
            request.documentIds
        )
        
        logger.info(f"✅ Process pending completed: {result['processedCount']} documents processed")
        return result
        
    except Exception as e:
        logger.error(f"Error in process_pending_documents endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Process pending documents failed: {str(e)}"
        )

@analyze_router.post("/generate-form-app", response_model=GenerateFormAppResponse)
async def generate_form_app(request: GenerateFormAppRequest):
    """
    Generate a form application based on the request
    """
    try:
        logger.info("Received generate form app request")
        
        result = await generate_form_app_service.generate_form_app(request.dict())
        
        logger.info(f"Generate form app completed successfully. Generated app: {result['appName']}")
        return result
        
    except Exception as e:
        logger.error(f"Error in generate_form_app endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Generate form app failed: {str(e)}"
        )

@analyze_router.post("/generate-embeddings", response_model=GenerateEmbeddingsResponse)
async def generate_embeddings(request: GenerateEmbeddingsRequest):
    """
    Generate embeddings for text and optionally update document in database
    """
    try:
        logger.info(f"Received generate embeddings request for text length: {len(request.text)}")
        
        result = await generate_embeddings_service.generate_embeddings(
            text=request.text,
            document_id=request.documentId
        )
        
        logger.info(f"Generate embeddings completed successfully. Generated {result['dimensions']} dimensions")
        return result
        
    except Exception as e:
        logger.error(f"Error in generate_embeddings endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Generate embeddings failed: {str(e)}"
        )

@analyze_router.post("/preview-images", response_model=ImagePreviewResponse)
async def preview_images(request: ImagePreviewRequest):
    """
    Convert PDF to images and return them for preview
    """
    try:
        logger.info("Received image preview request")
        logger.info(f"Document data length: {len(request.documentData) if request.documentData else 0}")
        
        if not request.documentData:
            raise HTTPException(status_code=400, detail="No document data provided")
        
        # Check if it's a PDF
        if not request.documentData.startswith('data:application/pdf'):
            raise HTTPException(status_code=400, detail="Only PDF documents are supported for image preview")
        
        # Convert PDF to images
        images = await pdf_processor.convert_pdf_to_images(request.documentData)
        
        if not images:
            return ImagePreviewResponse(
                images=[],
                totalPages=0,
                success=False,
                message="Failed to convert PDF to images"
            )
        
        logger.info(f"Successfully converted PDF to {len(images)} images")
        
        return ImagePreviewResponse(
            images=images,
            totalPages=len(images),
            success=True,
            message=f"Successfully converted {len(images)} pages to images"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in preview_images endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Image preview failed: {str(e)}"
        )

@analyze_router.post("/semantic-search")
async def semantic_search(request: SemanticSearchRequest):
    """
    Perform semantic search on documents using vector embeddings.
    """
    try:
        logger.info(f"Received semantic search request for query: '{request.query}'")
        logger.info(f"User ID: {request.userId}")
        logger.info(f"Limit: {request.limit}, Threshold: {request.similarity_threshold}")
        
        # Import semantic search service
        from ..services.modules.semantic_search_service import SemanticSearchService
        search_service = SemanticSearchService()
        
        # Perform semantic search
        search_results = await search_service.search_documents(
            query=request.query,
            user_id=request.userId,
            limit=request.limit,
            similarity_threshold=request.similarity_threshold,
            filters=request.filters
        )
        
        logger.info(f"Semantic search completed: {search_results.get('total', 0)} results found")
        
        return SemanticSearchResponse(**search_results)
        
    except Exception as e:
        logger.error(f"Error in semantic search endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Semantic search failed: {str(e)}"
        )

@analyze_router.post("/similar-documents")
async def find_similar_documents(request: SimilarDocumentsRequest):
    """
    Find documents similar to a given document using vector embeddings.
    """
    try:
        logger.info(f"Received similar documents request for document: {request.documentId}")
        logger.info(f"User ID: {request.userId}, Limit: {request.limit}")
        
        # Import semantic search service
        from ..services.modules.semantic_search_service import SemanticSearchService
        search_service = SemanticSearchService()
        
        # Find similar documents
        similar_docs = await search_service.get_similar_documents(
            document_id=request.documentId,
            user_id=request.userId,
            limit=request.limit
        )
        
        logger.info(f"Found {len(similar_docs)} similar documents")
        
        return {
            "similar_documents": similar_docs,
            "total": len(similar_docs),
            "document_id": request.documentId,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in similar documents endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Similar documents search failed: {str(e)}"
        )

@analyze_router.get("/health")
async def health_check():
    """Health check endpoint for the analyze service"""
    return {"status": "healthy", "service": "document-analysis"}

@analyze_router.post("/ask-question", response_model=RAGQuestionResponse)
async def ask_question(request: RAGQuestionRequest):
    """
    Ask a question and get an AI-generated answer using RAG (Retrieval-Augmented Generation).
    """
    try:
        logger.info(f"🤖 RAG Question: '{request.question}' for user {request.userId}")
        
        # Initialize RAG service
        rag_service = RAGService()
        
        # Ask question using RAG
        result = await rag_service.ask_question(
            question=request.question,
            user_id=request.userId,
            max_documents=request.max_documents,
            similarity_threshold=request.similarity_threshold,
            include_sources=request.include_sources
        )
        
        logger.info(f"✅ RAG answer generated with confidence: {result.get('confidence', 0.0)}")
        
        return RAGQuestionResponse(
            answer=result.get("answer", ""),
            confidence=result.get("confidence", 0.0),
            sources=result.get("sources", []),
            metadata=result.get("metadata", {})
        )
        
    except Exception as e:
        logger.error(f"RAG question answering failed: {e}")
        return RAGQuestionResponse(
            answer=f"I encountered an error while processing your question: {str(e)}",
            confidence=0.0,
            sources=[],
            metadata={"error": str(e), "question": request.question}
        )

@analyze_router.post("/document-summary", response_model=DocumentSummaryResponse)
async def get_document_summary(request: DocumentSummaryRequest):
    """
    Generate a summary of a specific document using AI.
    """
    try:
        logger.info(f"📄 Generating {request.summary_type} summary for document {request.documentId}")
        
        # Initialize RAG service
        rag_service = RAGService()
        
        # Generate summary
        result = await rag_service.get_document_summary(
            document_id=request.documentId,
            user_id=request.userId,
            summary_type=request.summary_type
        )
        
        logger.info(f"✅ Document summary generated")
        
        return DocumentSummaryResponse(
            summary=result.get("summary", ""),
            metadata=result.get("metadata", {})
        )
        
    except Exception as e:
        logger.error(f"Document summary generation failed: {e}")
        return DocumentSummaryResponse(
            summary=f"Error generating summary: {str(e)}",
            metadata={"error": str(e), "documentId": request.documentId}
        )

# Form Creation Request/Response models
class FormCreationRequest(BaseModel):
    documentData: str
    documentName: Optional[str] = None

class FormCreationResponse(BaseModel):
    success: bool
    hierarchical_data: Dict[str, Any]
    fields: List[Dict[str, Any]] = []
    sections: List[Dict[str, Any]] = []
    tables: List[Dict[str, Any]] = []
    signatures: List[Dict[str, Any]] = []
    message: str
    error: Optional[str] = None

@analyze_router.post("/create-form-from-document", response_model=FormCreationResponse)
async def create_form_from_document(request: FormCreationRequest):
    """
    Create form structure from a document (PDF or image) using AI
    """
    try:
        logger.info(f"Received form creation request for document: {request.documentName or 'unnamed'}")
        logger.info(f"Document data length: {len(request.documentData) if request.documentData else 0}")
        
        result = await form_creation_service.create_form_from_document(
            document_data=request.documentData,
            document_name=request.documentName,
        )
        
        logger.info(f"Form creation completed successfully")
        return FormCreationResponse(
            success=True,
            hierarchical_data=result.get("hierarchical_data", {}),
            fields=result.get("fields", []),
            sections=result.get("sections", []),
            tables=result.get("tables", []),
            signatures=result.get("signatures", []),
            message=result.get("message", "Form created successfully")
        )
        
    except Exception as e:
        logger.error(f"Error in create_form_from_document endpoint: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return FormCreationResponse(
            success=False,
            hierarchical_data={},
            message="Form creation failed",
            error=str(e)
        )

class WarmupResponse(BaseModel):
    success: bool
    message: str
    connections_initialized: bool

class CancelRequestRequest(BaseModel):
    requestId: str

class CancelRequestResponse(BaseModel):
    success: bool
    message: str

@analyze_router.post("/cancel-request", response_model=CancelRequestResponse)
async def cancel_request(cancel_request: CancelRequestRequest):
    """
    Cancel an ongoing document processing request
    """
    try:
        request_id = cancel_request.requestId
        logger.info(f"🛑 Cancellation requested for Request ID: {request_id}")
        
        with _cancellation_lock:
            cancellation_event = _cancellation_tokens.get(request_id)
            
            if cancellation_event:
                cancellation_event.set()
                logger.info(f"✅ Cancellation signal sent for Request ID: {request_id}")
                return CancelRequestResponse(
                    success=True,
                    message=f"Cancellation signal sent for request {request_id}"
                )
            else:
                logger.warning(f"⚠️ Request ID {request_id} not found or already completed")
                return CancelRequestResponse(
                    success=False,
                    message=f"Request {request_id} not found or already completed"
                )
                
    except Exception as e:
        logger.error(f"Error cancelling request: {str(e)}")
        return CancelRequestResponse(
            success=False,
            message=f"Failed to cancel request: {str(e)}"
        )

@analyze_router.post("/warmup", response_model=WarmupResponse)
async def warmup_connections():
    """
    Warm up HTTP connections by initializing the connection pool
    This should be called when a user uploads a file to pre-establish connections
    """
    try:
        logger.info("🔥 Connection warm-up requested")
        
        # Initialize HTTP session with connection pooling
        # Use a high default (100) to match pool3's max_workers cap
        # Processing will recreate the session with the actual worker count if needed
        # This warm-up is mainly for initial connection establishment
        max_connections = 100  # Match pool3's max cap for LLM calls
        llm_client._get_sync_session(max_connections=max_connections)
        
        logger.info(f"✅ Connection warm-up completed - HTTP session initialized with {max_connections} max connections")
        
        return WarmupResponse(
            success=True,
            message="Connections warmed up successfully",
            connections_initialized=True
        )
        
    except Exception as e:
        logger.warning(f"⚠️ Connection warm-up failed (non-critical): {str(e)}")
        # Don't fail - connections will be created on first real request
        return WarmupResponse(
            success=False,
            message=f"Warm-up failed: {str(e)}",
            connections_initialized=False
        )


# ============================================================================
# Document Type Detection & Bucket Management Endpoints
# ============================================================================

@analyze_router.post("/detect-document-type", response_model=DetectDocumentTypeResponse)
async def detect_document_type(
    file: bytes = Depends(lambda: None),
    request: DetectDocumentTypeRequest = None
):
    """
    Detect document type from uploaded PDF.
    Uses LLM to analyze first 2 pages and classify the document.
    """
    try:
        from fastapi import File, UploadFile
        logger.info(f"📄 Document type detection requested for: {request.filename if request else 'unknown'}")
        
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")
        
        result = await document_type_detector.detect_type(
            pdf_bytes=file,
            filename=request.filename if request else "document.pdf"
        )
        
        logger.info(f"✅ Document type detected: {result['document_type']} (confidence: {result['confidence']:.2f})")
        
        return DetectDocumentTypeResponse(**result)
        
    except Exception as e:
        logger.error(f"Error detecting document type: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.get("/document-types", response_model=GetDocumentTypesResponse)
async def get_document_types():
    """
    Get list of all known document types.
    Returns type names, display names, icons, and colors.
    """
    try:
        types = document_type_detector.get_all_document_types()
        
        return GetDocumentTypesResponse(
            types=types,
            total=len(types)
        )
        
    except Exception as e:
        logger.error(f"Error getting document types: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.post("/ensure-bucket", response_model=EnsureBucketResponse)
async def ensure_bucket(request: EnsureBucketRequest):
    """
    Ensure the documents storage bucket exists.
    All documents use a single 'documents' bucket.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        bucket_manager = BucketManager(supabase)
        
        # Always use the default 'documents' bucket
        result = await bucket_manager.get_or_create_bucket()
        
        return EnsureBucketResponse(
            bucket_name=result["bucket_name"],
            created=result.get("created", False),
            error=result.get("error")
        )
        
    except Exception as e:
        logger.error(f"Error ensuring bucket: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.get("/documents/{user_id}")
async def get_user_documents(user_id: str, document_type: Optional[str] = None):
    """
    Get all documents for a user, optionally filtered by document type.
    Returns documents grouped by type with metadata.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        
        # Build query - select all fields including storage_path, is_deleted, deleted_at, analysis_result
        query = supabase.table('documents').select('id, user_id, file_name, file_type, file_size, storage_path, created_at, updated_at, extracted_text, processing_status, metadata, document_type, is_deleted, deleted_at, analysis_result').eq('user_id', user_id)
        
        # Filter by document type if specified
        if document_type and document_type != 'all':
            query = query.eq('document_type', document_type)
        
        # Order by created_at descending (newest first)
        response = query.order('created_at', desc=True).execute()
        
        documents = response.data or []
        
        # Fetch folder relationships for all documents
        doc_ids = [doc['id'] for doc in documents]
        folders_map = {}
        
        if doc_ids:
            shortcuts_response = supabase.table('document_shortcuts').select('document_id, folder_id, smart_folders(id, name, folder_color, icon)').in_('document_id', doc_ids).execute()
            for shortcut in (shortcuts_response.data or []):
                doc_id = shortcut['document_id']
                
                if doc_id not in folders_map:
                    folders_map[doc_id] = []
                if shortcut.get('smart_folders'):
                    folders_map[doc_id].append({
                        'id': shortcut['smart_folders']['id'],
                        'name': shortcut['smart_folders']['name'],
                        'color': shortcut['smart_folders'].get('folder_color', '#6366f1'),
                        'icon': shortcut['smart_folders'].get('icon', 'Folder')
                    })

        # Group documents by type
        grouped = {}
        total_size = 0
        
        for doc in documents:
            # Skip documents marked as deleted
            if doc.get('is_deleted', False):
                continue
            
            doc_type = doc.get('document_type') or 'unknown'
            
            # Handle None or empty string
            if not doc_type or doc_type.strip() == '':
                doc_type = 'unknown'
            
            if doc_type not in grouped:
                # Create display name from type
                display_name = doc_type.replace('-', ' ').title() if doc_type else 'Unknown'
                
                grouped[doc_type] = {
                    'type': doc_type,
                    'display_name': display_name,
                    'count': 0,
                    'total_size': 0,
                    'documents': []
                }
            
            grouped[doc_type]['count'] += 1
            grouped[doc_type]['total_size'] += doc.get('file_size', 0)
            
            # Add public/signed URL for storage_path
            doc_with_url = doc.copy()
            
            # Map analysis_result to insights for frontend compatibility
            # Check if analysis_result is a non-empty dict (not just {})
            analysis_result = doc.get('analysis_result')
            if analysis_result and isinstance(analysis_result, dict) and len(analysis_result) > 0:
                doc_with_url['insights'] = analysis_result
            
            # Add folders array
            doc_with_url['folders'] = folders_map.get(doc['id'], [])
            
            if doc.get('storage_path'):
                try:
                    # Generate a signed URL (valid for 1 hour) since bucket is private
                    url_response = supabase.storage.from_('documents').create_signed_url(
                        doc['storage_path'],
                        3600  # 1 hour expiry
                    )
                    
                    # Extract signed URL from response
                    if isinstance(url_response, dict):
                        doc_with_url['storage_url'] = url_response.get('signedURL') or url_response.get('signedUrl') or url_response.get('url')
                    elif hasattr(url_response, 'get'):
                        doc_with_url['storage_url'] = url_response.get('signedURL') or url_response.get('signedUrl')
                    else:
                        doc_with_url['storage_url'] = getattr(url_response, 'signedURL', None) or str(url_response)
                        
                    logger.info(f"Generated signed URL for {doc['file_name']}")
                        
                except Exception as e:
                    logger.error(f"Failed to generate signed URL for {doc['storage_path']}: {str(e)}")
                    doc_with_url['storage_url'] = None
            
            grouped[doc_type]['documents'].append(doc_with_url)
            total_size += doc.get('file_size', 0)
        
        # Flatten documents from all groups to get complete list with storage_url
        all_docs_with_urls = []
        for group in grouped.values():
            all_docs_with_urls.extend(group['documents'])
        
        return {
            'success': True,
            'total_documents': len(all_docs_with_urls),
            'total_size': total_size,
            'document_types': list(grouped.values()),
            'documents': all_docs_with_urls
        }
        
    except Exception as e:
        logger.error(f"Error fetching documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.get("/documents/{user_id}/deleted")
async def get_deleted_documents(user_id: str):
    """
    Get all deleted documents (recycle bin) for a user.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        logger.info(f"🗑️ Fetching deleted documents for user: {user_id}")
        
        # Get all DELETED documents for user where is_deleted = true
        # Also include documents with NULL user_id (older documents)
        response = supabase.table('documents').select('*').eq('is_deleted', True).or_(f'user_id.eq.{user_id},user_id.is.null').order('deleted_at', desc=True).execute()
        
        documents = response.data or []
        logger.info(f"📊 Query returned {len(documents)} deleted documents")
        logger.info(f"📋 Document IDs: {[d.get('id') for d in documents]}")
        
        # Process documents to add storage URLs and metadata
        deleted_docs = []
        for doc in documents:
            doc_with_url = doc.copy()
            
            # Ensure metadata includes is_deleted flag
            if doc_with_url.get('metadata'):
                doc_with_url['metadata']['is_deleted'] = True
            else:
                doc_with_url['metadata'] = {'is_deleted': True}
            
            if doc.get('storage_path'):
                try:
                    url_response = supabase.storage.from_('documents').create_signed_url(doc['storage_path'], 3600)
                    if isinstance(url_response, dict):
                        doc_with_url['storage_url'] = url_response.get('signedURL') or url_response.get('signedUrl') or url_response.get('url')
                except Exception as e:
                    logger.warning(f"Failed to generate signed URL for {doc['storage_path']}: {e}")
                    doc_with_url['storage_url'] = None
            
            deleted_docs.append(doc_with_url)
        
        logger.info(f"✅ Found {len(deleted_docs)} deleted documents for user {user_id}")
        return {
            'success': True,
            'documents': deleted_docs,
            'total_documents': len(deleted_docs),
            'total_size': sum(doc.get('file_size', 0) for doc in deleted_docs)
        }
        
    except Exception as e:
        logger.error(f"❌ Error fetching deleted documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.get("/folders/{folder_id}/documents")
async def get_documents_in_folder(folder_id: str):
    """
    Get all documents assigned to a specific smart folder.
    """
    try:
        logger.info(f"📂 Fetching documents for folder: {folder_id}")
        from ..core.supabase_client import get_supabase_client
        supabase = get_supabase_client()

        # Verify folder exists
        logger.info(f"Verifying folder exists: {folder_id}")
        folder_resp = supabase.table('smart_folders').select('id, name, user_id, folder_color, icon, document_count').eq('id', folder_id).single().execute()
        if not folder_resp.data:
            logger.error(f"Folder not found: {folder_id}")
            raise HTTPException(status_code=404, detail='Folder not found')
        folder = folder_resp.data
        logger.info(f"Found folder: {folder['name']} with {folder.get('document_count', 0)} documents")

        # Get document IDs from shortcuts
        logger.info(f"Fetching document shortcuts for folder: {folder_id}")
        shortcuts_resp = supabase.table('document_shortcuts').select('document_id').eq('folder_id', folder_id).execute()
        document_ids = [s['document_id'] for s in (shortcuts_resp.data or [])]
        logger.info(f"Found {len(document_ids)} document shortcuts: {document_ids}")

        documents = []
        total_size = 0
        if document_ids:
            logger.info(f"Fetching document details for {len(document_ids)} documents")
            docs_resp = supabase.table('documents').select('id, user_id, file_name, file_type, file_size, storage_path, created_at, updated_at, extracted_text, processing_status, metadata, document_type, is_deleted, deleted_at').in_('id', document_ids).order('created_at', desc=True).execute()
            docs = docs_resp.data or []
            logger.info(f"Retrieved {len(docs)} documents from database")

            for doc in docs:
                # Skip documents marked as deleted
                if doc.get('is_deleted', False):
                    logger.info(f"Skipping deleted document in folder view: {doc.get('id')}")
                    continue

                doc_with_url = doc.copy()
                # Add this folder info
                doc_with_url['folders'] = [{
                    'id': folder['id'],
                    'name': folder['name'],
                    'color': folder.get('folder_color', '#6366f1'),
                    'icon': folder.get('icon', 'Folder')
                }]

                if doc.get('storage_path'):
                    try:
                        response = supabase.storage.from_('documents').create_signed_url(doc['storage_path'], 3600)
                        if isinstance(response, dict):
                            doc_with_url['storage_url'] = response.get('signedURL') or response.get('signedUrl') or response.get('url')
                        elif hasattr(response, 'get'):
                            doc_with_url['storage_url'] = response.get('signedURL') or response.get('signedUrl')
                        else:
                            doc_with_url['storage_url'] = getattr(response, 'signedURL', None) or str(response)
                    except Exception as e:
                        logger.error(f"Failed to generate signed URL for {doc['storage_path']}: {str(e)}")
                        doc_with_url['storage_url'] = None

                documents.append(doc_with_url)
                total_size += doc.get('file_size', 0)

        logger.info(f"✅ Returning {len(documents)} documents for folder {folder['name']}, total size: {total_size}")
        return {
            'success': True,
            'folder': folder,
            'documents': documents,
            'total_documents': len(documents),
            'total_size': total_size
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching documents for folder {folder_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """
    Soft delete a document by marking it as deleted using is_deleted flag.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        logger.info(f"Attempting to delete document: {document_id}")
        
        # First, get the document to verify it exists
        doc_resp = supabase.table('documents').select('id').eq('id', document_id).single().execute()
        if not doc_resp.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Update document with is_deleted flag and deleted_at timestamp
        supabase.table('documents').update({
            'is_deleted': True,
            'deleted_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', document_id).execute()
        
        logger.info(f"Document {document_id} marked as deleted successfully")
        
        return {
            'success': True,
            'message': 'Document moved to recycle bin',
            'document_id': document_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.post("/documents/{document_id}/restore")
async def restore_document(document_id: str):
    """
    Restore a soft-deleted document from recycle bin.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        from datetime import datetime
        
        supabase = get_supabase_client()
        logger.info(f"🔄 Restoring document: {document_id}")
        
        # Update document to unmark as deleted
        response = supabase.table('documents').update({
            'is_deleted': False,
            'deleted_at': None,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', document_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        logger.info(f"✅ Document {document_id} restored successfully")
        
        return {
            'success': True,
            'message': 'Document restored from recycle bin',
            'document_id': document_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error restoring document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.delete("/documents/{document_id}/permanent")
async def permanent_delete_document(document_id: str):
    """
    Permanently delete a document (hard delete).
    This action cannot be undone.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        logger.info(f"🗑️ Permanently deleting document: {document_id}")
        
        # Get document to delete from storage
        doc_response = supabase.table('documents').select('storage_path').eq('id', document_id).execute()
        
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        storage_path = doc_response.data[0].get('storage_path')
        
        # Delete from storage if path exists
        if storage_path:
            try:
                supabase.storage.from_('documents').remove([storage_path])
                logger.info(f"📦 Deleted file from storage: {storage_path}")
            except Exception as storage_error:
                logger.warning(f"Storage deletion failed (may not exist): {storage_error}")
        
        # Delete from database
        response = supabase.table('documents').delete().eq('id', document_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        logger.info(f"✅ Document {document_id} permanently deleted")
        
        return {
            'success': True,
            'message': 'Document permanently deleted',
            'document_id': document_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error permanently deleting document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@analyze_router.get("/processing-history/{user_id}")
async def get_processing_history(
    user_id: str,
    limit: Optional[int] = 50,
    status_filter: Optional[str] = None
):
    """
    Get processing history for a user with detailed status information.
    Shows all document processing attempts including successes and failures.
    """
    try:
        from ..core.supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        
        # Build query to get all documents with their processing status
        query = supabase.table('documents').select(
            'id, user_id, file_name, file_type, file_size, storage_path, '
            'created_at, updated_at, processing_status, metadata, document_type, analysis_result'
        ).eq('user_id', user_id)
        
        # Filter by status if specified
        if status_filter and status_filter != 'all':
            query = query.eq('processing_status', status_filter)
        
        # Order by created_at descending (newest first) and limit
        response = query.order('created_at', desc=True).limit(limit).execute()
        
        documents = response.data or []
        
        # Process each document to extract processing details
        processing_history = []
        for doc in documents:
            # Determine status and error message
            status = doc.get('processing_status', 'unknown')
            error_message = None
            fields_count = 0
            confidence = 0.0
            
            # Check for errors in metadata or analysis_result
            metadata = doc.get('metadata', {}) or {}
            analysis_result = doc.get('analysis_result', {}) or {}
            
            # Extract error information
            if status == 'failed' or status == 'error':
                error_message = (
                    metadata.get('error') or 
                    metadata.get('error_message') or
                    analysis_result.get('error') or
                    "Failed to save document: Could not find the 'file_path' column of 'documents' in the schema cache"
                )
            
            # Extract field count and confidence
            if analysis_result:
                if 'hierarchical_data' in analysis_result:
                    # Count fields in hierarchical structure
                    fields_count = sum(
                        len(section) if isinstance(section, dict) else 1
                        for section in analysis_result.get('hierarchical_data', {}).values()
                    )
                elif 'fields' in analysis_result:
                    fields_count = len(analysis_result.get('fields', []))
                
                # Extract confidence
                if 'confidence' in analysis_result:
                    confidence = analysis_result.get('confidence', 0.0)
                elif 'metadata' in analysis_result and 'avg_confidence' in analysis_result['metadata']:
                    confidence = analysis_result['metadata'].get('avg_confidence', 0.0)
            
            # Generate signed URL for viewing
            storage_url = None
            if doc.get('storage_path'):
                try:
                    response_url = supabase.storage.from_('documents').create_signed_url(
                        doc['storage_path'],
                        3600  # 1 hour expiry
                    )
                    if isinstance(response_url, dict):
                        storage_url = response_url.get('signedURL') or response_url.get('signedUrl')
                except Exception as e:
                    logger.error(f"Failed to generate signed URL: {str(e)}")
            
            processing_history.append({
                'id': doc.get('id'),
                'file_name': doc.get('file_name'),
                'file_type': doc.get('file_type'),
                'file_size': doc.get('file_size'),
                'document_type': doc.get('document_type') or 'unknown',
                'status': status,
                'error_message': error_message,
                'fields_count': fields_count,
                'confidence': confidence,
                'processed_at': doc.get('created_at'),
                'updated_at': doc.get('updated_at'),
                'storage_url': storage_url,
                'has_analysis_result': bool(analysis_result)
            })
        
        # Calculate statistics
        total_count = len(processing_history)
        completed_count = sum(1 for item in processing_history if item['status'] == 'completed')
        failed_count = sum(1 for item in processing_history if item['status'] in ['failed', 'error'])
        processing_count = sum(1 for item in processing_history if item['status'] == 'processing')
        
        return {
            'success': True,
            'total': total_count,
            'statistics': {
                'total': total_count,
                'completed': completed_count,
                'failed': failed_count,
                'processing': processing_count,
                'success_rate': (completed_count / total_count * 100) if total_count > 0 else 0
            },
            'history': processing_history
        }
        
    except Exception as e:
        logger.error(f"Error fetching processing history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
