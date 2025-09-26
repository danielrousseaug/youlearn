from fastapi import APIRouter
from db import get_pdf_extracts, get_pdf_information
from typing import List, Dict, Any

router = APIRouter()

@router.get("/debug/chunks/{doc_id}")
async def get_debug_chunks(doc_id: str) -> Dict[str, Any]:
    """
    Debug endpoint to view all chunks with their bounding boxes
    """
    try:
        # Get PDF extracts
        extracts = get_pdf_extracts(doc_id)

        # Get PDF info
        pdf_info = get_pdf_information(doc_id)

        # Format chunks for debugging
        chunks = []
        for i, extract in enumerate(extracts, 1):
            chunk = {
                "chunk_id": i,
                "page": int(extract.page_number),
                "text": extract.text,
                "text_preview": extract.text[:200] + "..." if len(extract.text) > 200 else extract.text,
                "bbox": extract.bbox,
                "bbox_info": {
                    "x1": extract.bbox[0],
                    "y1": extract.bbox[1],
                    "x2": extract.bbox[2],
                    "y2": extract.bbox[3],
                    "width": extract.bbox[2] - extract.bbox[0],
                    "height": extract.bbox[3] - extract.bbox[1]
                }
            }
            chunks.append(chunk)

        return {
            "doc_id": doc_id,
            "pdf_info": pdf_info,
            "total_chunks": len(chunks),
            "chunks": chunks,
            "pages_with_chunks": list(set(chunk["page"] for chunk in chunks))
        }

    except Exception as e:
        return {"error": str(e)}