"""
YouLearn API - Content processing and summary generation service.

This FastAPI application provides endpoints for:
- PDF document upload and processing
- YouTube video transcript extraction
- Streaming LLM-based summary generation with citations
- Content management and debugging tools
"""

import os
import shutil
import uuid

from fastapi import FastAPI, Path, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Local imports
from summary_generation import generate_summary_stream
from db import get_pdf_information, get_content_information, is_youtube_content
from debug_chunks import router as debug_router
from pdf_processor import save_pdf_chunks
from youtube_processor import extract_video_id, save_youtube_chunks, get_video_info

# Constants
UPLOAD_DIR = "uploads"

# Initialize FastAPI app
app = FastAPI(
    title="YouLearn API",
    description="Content processing and summary generation service",
    version="1.0.0"
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],  # Frontend URLs for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(debug_router)

# Setup directories and static file serving
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Pydantic models for request validation
class SummaryRequest(BaseModel):
    """Request model for summary generation."""
    doc_id: str = Field(
        default="pdf_1",
        description="The document ID to summarize. Can be preset PDF IDs, uploaded file IDs, or YouTube video IDs.",
        examples=["pdf_1", "pdf_2", "pdf_3", "uploaded_abc123", "dQw4w9WgXcQ"]
    )


class YouTubeRequest(BaseModel):
    """Request model for YouTube video processing."""
    url: str = Field(
        description="YouTube video URL to process and extract transcript from",
        examples=["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ"]
    )

# In-memory storage for uploaded content metadata
# Note: In production, this should be replaced with a proper database
uploaded_pdfs = {}
processed_videos = {}


# API Endpoints
@app.post("/summary", tags=["Summary"])
async def generate_summary(data: SummaryRequest):
    """
    Generate a streaming summary for the specified document or video.

    This endpoint accepts a document ID (PDF or YouTube video) and returns
    a streaming response with real-time summary generation and citations.
    """
    return StreamingResponse(
        generate_summary_stream(doc_id=data.doc_id),
        media_type="application/json"
    )

@app.post("/upload", tags=["Content Upload"])
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload and process a PDF file for summary generation.

    This endpoint accepts a PDF file upload, saves it to the server,
    extracts text chunks for processing, and returns a unique file ID
    that can be used for summary generation.

    Args:
        file: PDF file to upload (must have .pdf extension)

    Returns:
        dict: Contains file_id and filename for the uploaded file

    Raises:
        HTTPException: If file is not a PDF or processing fails
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed. Please upload a file with .pdf extension."
        )

    # Generate unique ID and file path
    file_id = f"uploaded_{uuid.uuid4().hex[:8]}"
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")

    # Save uploaded file to disk
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save uploaded file: {str(e)}"
        )
    finally:
        file.file.close()

    # Extract text chunks for summary generation
    try:
        save_pdf_chunks(file_id, file_path)
    except Exception as e:
        print(f"Warning: Failed to extract text from PDF {file.filename}: {e}")
        # Continue with upload even if text extraction fails

    # Store metadata in memory
    uploaded_pdfs[file_id] = {
        "filename": file.filename,
        "url": f"http://localhost:8000/uploads/{file_id}.pdf",
        "title": file.filename.replace('.pdf', ''),
        "path": file_path,
        "type": "pdf"
    }

    return {
        "file_id": file_id,
        "filename": file.filename,
        "message": "PDF uploaded and processed successfully"
    }

@app.post("/upload-youtube", tags=["Content Upload"])
async def process_youtube_video(data: YouTubeRequest):
    """
    Process a YouTube video URL and extract transcript for summary generation.

    This endpoint accepts a YouTube video URL, extracts the video ID,
    downloads the transcript, processes it into chunks, and returns
    a video ID that can be used for summary generation.

    Args:
        data: YouTubeRequest containing the video URL

    Returns:
        dict: Contains video_id, url, title, and processing status

    Raises:
        HTTPException: If URL is invalid or processing fails
    """
    # Extract and validate video ID
    video_id = extract_video_id(data.url)
    if not video_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a valid YouTube video URL."
        )

    # Check if video is already processed
    if video_id in processed_videos:
        existing_video = processed_videos[video_id]
        return {
            "video_id": video_id,
            "url": data.url,
            "title": existing_video["title"],
            "status": "already_processed",
            "message": "Video was previously processed and is ready for summary generation"
        }

    # Extract transcript and process into chunks
    try:
        save_youtube_chunks(video_id, data.url)
    except Exception as e:
        print(f"Warning: Failed to extract transcript from YouTube video {video_id}: {e}")
        # Continue with basic video info even if transcript extraction fails

    # Get video information
    try:
        video_info = get_video_info(video_id)
    except Exception as e:
        # Fallback video info if API fails
        video_info = {
            "id": video_id,
            "title": f"YouTube Video {video_id}",
            "url": data.url,
            "embed_url": f"https://www.youtube.com/embed/{video_id}"
        }

    # Store metadata in memory
    processed_videos[video_id] = {
        "video_id": video_id,
        "url": data.url,
        "title": video_info["title"],
        "embed_url": video_info["embed_url"],
        "type": "youtube"
    }

    return {
        "video_id": video_id,
        "url": data.url,
        "title": video_info["title"],
        "status": "processed",
        "message": "YouTube video processed successfully"
    }

@app.get("/content/{doc_id}", tags=["Content Retrieval"])
async def get_content_metadata(
    doc_id: str = Path(
        ...,
        description="Content ID - can be preset PDF ID (pdf_1, pdf_2, pdf_3), uploaded file ID (uploaded_xxx), or YouTube video ID",
        examples=["pdf_1", "uploaded_abc123", "dQw4w9WgXcQ"]
    )
):
    """
    Retrieve metadata for any type of content (PDF or YouTube video).

    This endpoint returns metadata for the specified content including
    title, URL, type, and other relevant information needed for display
    and processing.

    Args:
        doc_id: Content identifier (preset PDF, uploaded PDF, or YouTube video ID)

    Returns:
        dict: Content metadata including title, URL, type, etc.

    Raises:
        HTTPException: If content is not found
    """
    # Handle uploaded PDFs
    if doc_id.startswith("uploaded_"):
        # Check in-memory metadata first
        if doc_id in uploaded_pdfs:
            return uploaded_pdfs[doc_id]

        # Check if file exists on disk (for recovery scenarios)
        file_path = os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")
        if os.path.exists(file_path):
            # Recreate basic metadata for existing files
            return {
                "id": doc_id,
                "url": f"http://localhost:8000/uploads/{doc_id}.pdf",
                "title": doc_id.replace("uploaded_", "").replace("_", " ").title(),
                "type": "pdf"
            }

        raise HTTPException(status_code=404, detail="Uploaded PDF not found")

    # Handle YouTube videos
    if is_youtube_content(doc_id):
        # Check in-memory metadata first
        if doc_id in processed_videos:
            return processed_videos[doc_id]

        # Try to get from persistent storage/db
        try:
            return get_content_information(doc_id)
        except Exception:
            raise HTTPException(status_code=404, detail="YouTube video not found or not processed")

    # Handle preset PDFs
    try:
        return get_pdf_information(doc_id)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Content not found. Available preset PDFs: pdf_1, pdf_2, pdf_3"
        )


@app.get("/pdf/{doc_id}", tags=["Content Retrieval"], deprecated=True)
async def get_pdf_metadata_legacy(
    doc_id: str = Path(
        ...,
        description="Document ID for backward compatibility",
        examples=["pdf_1", "uploaded_abc123"]
    )
):
    """
    Legacy endpoint for PDF metadata retrieval.

    This endpoint is deprecated. Use `/content/{doc_id}` instead.
    Maintained for backward compatibility only.
    """
    return await get_content_metadata(doc_id)

@app.get("/chunks/{doc_id}", tags=["Debug"])
async def get_content_chunks(
    doc_id: str = Path(
        ...,
        description="Document ID for chunk extraction (preset PDFs only)",
        examples=["pdf_1", "pdf_2", "pdf_3"]
    )
):
    """
    Get raw content chunks for debugging citation accuracy.

    This endpoint returns the processed text chunks for a document,
    showing how the content is divided for the LLM and how citations
    will map back to specific text segments.

    Note: Currently only supports preset PDFs, not uploaded files.

    Args:
        doc_id: Document ID (must be a preset PDF)

    Returns:
        dict: Contains doc_id, total_chunks, and array of chunk data

    Raises:
        HTTPException: If document is not found
    """
    # For uploaded PDFs, chunks are not yet supported in the chunks endpoint
    if doc_id.startswith("uploaded_"):
        return {
            "doc_id": doc_id,
            "total_chunks": 0,
            "chunks": [],
            "message": "Chunk extraction for uploaded PDFs is not yet supported in this endpoint"
        }

    # Import here to avoid circular imports
    from db import get_pdf_extracts

    try:
        extracts = get_pdf_extracts(doc_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Chunks not found for document '{doc_id}'. Available: pdf_1, pdf_2, pdf_3"
        )

    # Convert extracts to standardized chunk format
    chunks = []
    for i, extract in enumerate(extracts, 1):
        chunks.append({
            "index": i,
            "page": int(extract.page_number),
            "bbox": extract.bbox,
            "text": extract.text,
            "preview": extract.text[:300] + "..." if len(extract.text) > 300 else extract.text
        })

    return {
        "doc_id": doc_id,
        "total_chunks": len(chunks),
        "chunks": chunks
    }


@app.get("/youtube-transcript/{video_id}", tags=["YouTube"])
async def get_youtube_transcript(
    video_id: str = Path(
        ...,
        description="YouTube video ID for transcript retrieval",
        examples=["dQw4w9WgXcQ"]
    )
):
    """
    Get YouTube video transcript segments for display.

    This endpoint returns the processed transcript segments for a YouTube video,
    with timing information and formatted text for display in the UI.

    Args:
        video_id: YouTube video ID

    Returns:
        dict: Contains video_id, total_segments, and array of transcript segments

    Raises:
        HTTPException: If transcript is not found
    """
    # Import here to avoid circular imports
    from db import get_youtube_extracts

    try:
        extracts = get_youtube_extracts(video_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Transcript not found for video '{video_id}'. Video may not be processed yet."
        )

    if not extracts:
        raise HTTPException(
            status_code=404,
            detail="YouTube transcript not found or is empty"
        )

    # Convert extracts to display-friendly segments
    segments = []
    for extract in extracts:
        # Format timestamps for display
        start_min, start_sec = divmod(int(extract.start_time), 60)
        end_min, end_sec = divmod(int(extract.end_time), 60)
        timestamp_display = f"{start_min:02d}:{start_sec:02d} - {end_min:02d}:{end_sec:02d}"

        segments.append({
            "start_time": extract.start_time,
            "duration": extract.duration,
            "end_time": extract.end_time,
            "text": extract.text,
            "timestamp_display": timestamp_display
        })

    return {
        "video_id": video_id,
        "total_segments": len(segments),
        "segments": segments
    }
