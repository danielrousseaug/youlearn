from fastapi import FastAPI, Path, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import BaseModel, Field
import shutil
import os
import uuid

load_dotenv()

from summary_generation import generate_summary_stream
from db import get_pdf_information
from debug_chunks import router as debug_router
from pdf_processor import save_pdf_chunks

app = FastAPI()

# Include debug router
app.include_router(debug_router)

# Create uploads directory if it doesn't exist
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount the uploads directory to serve files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SummaryRequest(BaseModel):
    doc_id: str = Field(
        default="pdf_1",
        description="The document ID to summarize. Example values: 'pdf_1', 'pdf_2', 'pdf_3'.",
        examples=["pdf_1", "pdf_2", "pdf_3"]
    )

@app.post("/summary")
async def stream_endpoint(
    data: SummaryRequest
):
    return StreamingResponse(
        generate_summary_stream(doc_id=data.doc_id), media_type="application/json"
    )

# Storage for uploaded PDFs metadata
uploaded_pdfs = {}

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file and process it."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Generate unique ID for this upload
    file_id = f"uploaded_{uuid.uuid4().hex[:8]}"

    # Save the file to disk
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    finally:
        file.file.close()

    # Process the PDF and extract chunks for summary generation
    try:
        save_pdf_chunks(file_id, file_path)
    except Exception as e:
        print(f"Warning: Failed to extract text from PDF: {e}")
        # Continue anyway - we'll use placeholder text

    # Store metadata
    uploaded_pdfs[file_id] = {
        "filename": file.filename,
        "url": f"http://localhost:8000/uploads/{file_id}.pdf",
        "title": file.filename.replace('.pdf', ''),
        "path": file_path
    }

    return {"file_id": file_id, "filename": file.filename}

@app.get("/pdf/{doc_id}")
async def pdf_endpoint(
    doc_id: str = Path(
        ...,
        description="The document ID. Example values: 'pdf_1', 'pdf_2', 'pdf_3', or uploaded IDs.",
    )
):
    # Check if it's an uploaded PDF
    if doc_id.startswith("uploaded_"):
        # Check if we have this file in memory
        if doc_id in uploaded_pdfs:
            return uploaded_pdfs[doc_id]

        # Check if the file exists on disk
        file_path = os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")
        if os.path.exists(file_path):
            # Recreate metadata for files that exist but aren't in memory
            return {
                "url": f"http://localhost:8000/uploads/{doc_id}.pdf",
                "title": doc_id.replace("uploaded_", "").replace("_", " ")
            }

        raise HTTPException(status_code=404, detail="PDF not found")

    # Otherwise use existing logic for preset PDFs
    return get_pdf_information(doc_id)

@app.get("/chunks/{doc_id}")
async def chunks_endpoint(
    doc_id: str = Path(
        ...,
        description="The document ID. Example values: 'pdf_1', 'pdf_2', 'pdf_3'.",
        examples=["pdf_1", "pdf_2", "pdf_3"]
    )
):
    """Get raw chunks for debugging citation accuracy."""
    # For uploaded PDFs, return empty chunks for now
    if doc_id.startswith("uploaded_"):
        return {
            "doc_id": doc_id,
            "total_chunks": 0,
            "chunks": []
        }

    from db import get_pdf_extracts

    extracts = get_pdf_extracts(doc_id)

    # Return chunks with their indices as they would be sent to the model
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
