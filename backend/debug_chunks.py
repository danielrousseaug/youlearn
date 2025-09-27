"""
Debug router for detailed chunk inspection and visualization.

This module provides debugging endpoints that offer detailed views of how
content is processed into chunks, including bounding box information and
text preview for development and troubleshooting purposes.
"""

from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Path

from db import get_pdf_extracts, get_pdf_information

router = APIRouter(prefix="/debug", tags=["Debug"])


@router.get("/chunks/{doc_id}")
async def get_detailed_chunks(
    doc_id: str = Path(
        ...,
        description="Document ID for detailed chunk inspection",
        examples=["pdf_1", "pdf_2", "pdf_3"]
    )
) -> Dict[str, Any]:
    """
    Get detailed chunk information for debugging and development.

    This endpoint provides comprehensive information about how a document
    is processed into chunks, including:
    - Full text content and previews
    - Bounding box coordinates and dimensions
    - Page distribution statistics
    - PDF metadata

    Useful for debugging citation accuracy and chunk processing.

    Args:
        doc_id: Document ID (must be a preset PDF)

    Returns:
        dict: Detailed chunk information with metadata

    Raises:
        HTTPException: If document is not found or processing fails
    """
    try:
        # Get PDF extracts and metadata
        extracts = get_pdf_extracts(doc_id)
        pdf_info = get_pdf_information(doc_id)

        # Process chunks with detailed information
        chunks = []
        for i, extract in enumerate(extracts, 1):
            # Calculate bounding box dimensions
            bbox = extract.bbox
            width = bbox[2] - bbox[0] if len(bbox) >= 4 else 0
            height = bbox[3] - bbox[1] if len(bbox) >= 4 else 0

            chunk = {
                "chunk_id": i,
                "page": int(extract.page_number),
                "text": extract.text,
                "text_preview": extract.text[:200] + "..." if len(extract.text) > 200 else extract.text,
                "text_length": len(extract.text),
                "bbox": bbox,
                "bbox_info": {
                    "x1": bbox[0] if len(bbox) >= 1 else 0,
                    "y1": bbox[1] if len(bbox) >= 2 else 0,
                    "x2": bbox[2] if len(bbox) >= 3 else 0,
                    "y2": bbox[3] if len(bbox) >= 4 else 0,
                    "width": width,
                    "height": height,
                    "area": width * height
                }
            }
            chunks.append(chunk)

        # Calculate statistics
        pages_with_chunks = sorted(set(chunk["page"] for chunk in chunks))
        chunks_per_page = {}
        for chunk in chunks:
            page = chunk["page"]
            chunks_per_page[page] = chunks_per_page.get(page, 0) + 1

        return {
            "doc_id": doc_id,
            "pdf_info": pdf_info,
            "total_chunks": len(chunks),
            "chunks": chunks,
            "statistics": {
                "pages_with_chunks": pages_with_chunks,
                "total_pages": len(pages_with_chunks),
                "chunks_per_page": chunks_per_page,
                "average_chunks_per_page": len(chunks) / len(pages_with_chunks) if pages_with_chunks else 0,
                "total_text_length": sum(len(chunk["text"]) for chunk in chunks),
                "average_chunk_length": sum(len(chunk["text"]) for chunk in chunks) / len(chunks) if chunks else 0
            }
        }

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{doc_id}' not found. Available documents: pdf_1, pdf_2, pdf_3"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process chunks for document '{doc_id}': {str(e)}"
        )