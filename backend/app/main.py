from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from typing import Dict, Any, Optional
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timedelta

# Load environment variables before importing settings
backend_dir = Path(__file__).parent.parent
env_file_path = backend_dir / ".env"
if env_file_path.exists():
    load_dotenv(env_file_path)

from .api.routes import analyze_router
from .api.quick_access import router as quick_access_router
from .api.checkinout import router as checkinout_router
from .api.ownership_transfers import router as ownership_transfers_router
from .api.shares import router as shares_router
from .api.rules import router as rules_router
from .api.guest import router as guest_router
from .api.signatures import router as signatures_router
from .api.watermarks import router as watermarks_router
from .api.migration import router as migration_router
from .api.document_editor import router as document_editor_router
from .api.ai_routes import router as ai_router
from .core.config import settings

# Configure logging with both console and file handlers
log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

# Create logs directory if it doesn't exist
logs_dir = backend_dir / "logs"
logs_dir.mkdir(exist_ok=True)

def cleanup_old_logs(logs_directory: Path, retention_days: int):
    """
    Clean up old log files that are older than retention_days.
    
    Args:
        logs_directory: Path to the logs directory
        retention_days: Number of days to keep logs (0 = keep forever)
    """
    if retention_days <= 0:
        return  # Keep all logs if retention_days is 0 or negative
    
    cutoff_date = datetime.now() - timedelta(days=retention_days)
    deleted_count = 0
    total_size_freed = 0
    
    try:
        for log_file in logs_directory.glob("app_*.log*"):
            try:
                # Get file modification time
                file_mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                
                # Delete if older than retention period
                if file_mtime < cutoff_date:
                    file_size = log_file.stat().st_size
                    log_file.unlink()
                    deleted_count += 1
                    total_size_freed += file_size
            except (OSError, ValueError) as e:
                # Skip files that can't be accessed or parsed
                continue
        
        if deleted_count > 0:
            size_mb = total_size_freed / (1024 * 1024)
            # Use print for cleanup messages since logger might not be configured yet
            print(f"🧹 Cleaned up {deleted_count} old log file(s) ({size_mb:.2f}MB freed)")
    except Exception as e:
        # Don't fail startup if cleanup fails
        # Use print for cleanup messages since logger might not be configured yet
        print(f"⚠️ Failed to cleanup old logs: {e}")

# Clean up old log files on startup
cleanup_old_logs(logs_dir, settings.LOG_RETENTION_DAYS)

# Generate log filename with date and time
timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
log_filename = logs_dir / f"app_{timestamp}.log"

# Configure root logger
root_logger = logging.getLogger()
root_logger.setLevel(log_level)

# Suppress verbose HTTP/2 HPACK debug logs from httpx/httpcore
logging.getLogger("hpack").setLevel(logging.WARNING)
logging.getLogger("hpack.hpack").setLevel(logging.WARNING)
logging.getLogger("hpack.table").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.INFO)  # Only show INFO and above
logging.getLogger("httpcore").setLevel(logging.INFO)  # Only show INFO and above
logging.getLogger("httpcore.connection").setLevel(logging.WARNING)
logging.getLogger("httpcore.http11").setLevel(logging.WARNING)

# Clear any existing handlers
root_logger.handlers.clear()

# Create formatter
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Console handler (stdout)
console_handler = logging.StreamHandler()
console_handler.setLevel(log_level)
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

# File handler with rotation
max_bytes = settings.LOG_FILE_MAX_SIZE * 1024 * 1024  # Convert MB to bytes
file_handler = RotatingFileHandler(
    log_filename,
    maxBytes=max_bytes,
    backupCount=settings.LOG_FILE_BACKUP_COUNT,
    encoding='utf-8'
)
file_handler.setLevel(log_level)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)
logger.info(f"📝 Logging configured - Console: enabled, File: {log_filename}")
logger.info(f"📁 Log file will rotate at {settings.LOG_FILE_MAX_SIZE}MB, keeping {settings.LOG_FILE_BACKUP_COUNT} backups")
if settings.LOG_RETENTION_DAYS > 0:
    logger.info(f"🗑️ Old log files will be automatically deleted after {settings.LOG_RETENTION_DAYS} days")
else:
    logger.info(f"📦 Log retention disabled - all log files will be kept")

app = FastAPI(
    title="Document Analysis API",
    description="Smart Document Processing with AI-powered template matching",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(analyze_router, prefix="/api/v1")
app.include_router(quick_access_router, prefix="/api/v1")
app.include_router(checkinout_router)
app.include_router(ownership_transfers_router)
app.include_router(shares_router)
app.include_router(rules_router)
app.include_router(guest_router)
app.include_router(signatures_router)
app.include_router(watermarks_router)
app.include_router(migration_router)
app.include_router(document_editor_router, prefix="/api")
app.include_router(ai_router)

@app.on_event("shutdown")
async def shutdown_event():
    """
    CRITICAL FIX #5: Cleanup on application shutdown
    Closes async HTTP clients and other resources to prevent memory leaks
    """
    try:
        logger.info("🛑 Application shutting down - cleaning up resources...")
        
        # Close async HTTP client from LLMClient
        from .api.routes import llm_client
        if llm_client and hasattr(llm_client, '_http_client') and llm_client._http_client:
            try:
                await llm_client.close()
                logger.info("✅ Async HTTP client closed")
            except Exception as e:
                logger.warning(f"⚠️ Error closing async HTTP client: {e}")
        
        # Cleanup cancellation tokens
        from .api.routes import _cancellation_tokens, _cancellation_lock
        with _cancellation_lock:
            _cancellation_tokens.clear()
            logger.info("✅ Cancellation tokens cleared")
        
        logger.info("✅ Shutdown cleanup complete")
    except Exception as e:
        logger.error(f"❌ Error during shutdown cleanup: {e}")

@app.get("/")
async def root():
    return {"message": "Document Analysis API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "document-analysis-api"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )