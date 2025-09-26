from fastapi import FastAPI, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

from summary_generation import generate_summary_stream
from db import get_pdf_information
from debug_chunks import router as debug_router

app = FastAPI()

# Include debug router
app.include_router(debug_router)

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

@app.get("/pdf/{doc_id}")
async def pdf_endpoint(
    doc_id: str = Path(
        ...,
        description="The document ID. Example values: 'pdf_1', 'pdf_2', 'pdf_3'.",
        examples=["pdf_1", "pdf_2", "pdf_3"]
    )
):
    return get_pdf_information(doc_id)
