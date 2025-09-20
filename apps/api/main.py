"""Main FastAPI application for ViQi backend."""
import os
import sys
from dotenv import load_dotenv

# Load environment variables from the parent directory's .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
import uvicorn

# Configure logging
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | {message}",
    level="DEBUG" if os.getenv("DEBUG", "false").lower() == "true" else "INFO"
)

# Add file logging only when filesystem is writable
log_dir = "logs"
try:
    if os.access(".", os.W_OK):
        os.makedirs(log_dir, exist_ok=True)
        logger.add(os.path.join(log_dir, "api.log"), rotation="500 MB", level="DEBUG")
    else:
        logger.info("Skipping file logging; filesystem is read-only")
except Exception as exc:
    logger.warning(f"Skipping file logging due to error: {exc}")

# Import routes (session-only routes)
from routes import matching_poc


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management - session-only setup."""
    logger.info("Starting ViQi API server (session-only mode)...")
    logger.info("No database required - using session-only authentication")
    
    yield
    
    logger.info("Shutting down ViQi API server...")


# Create FastAPI app
app = FastAPI(
    title="ViQi API",
    description="Film & TV Industry Matchmaking API",
    version="1.0.0",
    debug=os.getenv("DEBUG", "false").lower() == "true",
    lifespan=lifespan
)

# CORS middleware (flexible for Vercel and Render)
cors_origins_env = os.getenv("CORS_ORIGINS", "")
cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()] or [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "https://localhost:3000",
    "https://localhost:3001",
    "https://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\\.vercel\\.app$|https://.*\\.onrender\\.com$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Trusted host middleware (include Vercel and Render)
trusted_hosts_env = os.getenv("TRUSTED_HOSTS", "")
trusted_hosts = [h.strip() for h in trusted_hosts_env.split(",") if h.strip()] or [
    "localhost",
    "127.0.0.1",
    "*.vercel.app",
    "*.onrender.com",
    "viqi-prototype.onrender.com",
]

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=trusted_hosts
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    start_time = logger.bind().opt(record=True).info(
        f"Request: {request.method} {request.url.path}"
    )
    
    # Add request ID for tracing
    import uuid
    request_id = str(uuid.uuid4())[:8]
    logger.contextualize(request_id=request_id)
    
    response = await call_next(request)
    
    logger.info(
        f"Response: {request.method} {request.url.path} | "
        f"Status: {response.status_code} | "
        f"Request ID: {request_id}"
    )
    
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler with logging."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail, "type": "http_error"}
        )
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "type": "internal_error",
            "message": str(exc) if os.getenv("DEBUG") else "Something went wrong"
        }
    )


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "viqi-api",
        "version": "1.0.0"
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "ViQi API - Film & TV Industry Matchmaking",
        "docs": "/docs",
        "health": "/health"
    }


# Include routers (session-only POC)
app.include_router(matching_poc.router, prefix="/api/matching-poc", tags=["matching-poc"])  # Session-only POC version


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_config=None  # Use loguru instead of uvicorn's logging
    )
