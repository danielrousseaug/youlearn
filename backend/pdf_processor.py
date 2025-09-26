"""PDF processing utilities using PyMuPDF for precise text extraction with bounding boxes."""
import json
import os
import hashlib
from typing import List, Dict
import fitz  # PyMuPDF

def extract_with_bboxes(pdf_path: str) -> Dict:
    """
    Extract text with character-level, word-level, and line-level bboxes
    """
    doc = fitz.open(pdf_path)
    document_data = {
        "doc_id": generate_doc_id(pdf_path),
        "total_pages": len(doc),
        "pages": []
    }

    for page_num, page in enumerate(doc):
        page_data = {
            "page_num": page_num,
            "width": page.rect.width,
            "height": page.rect.height,
            "segments": []
        }

        # Extract text blocks with coordinates
        blocks = page.get_text("dict")

        for block_idx, block in enumerate(blocks["blocks"]):
            if "lines" in block:  # Text block
                for line_idx, line in enumerate(block["lines"]):
                    for span_idx, span in enumerate(line["spans"]):
                        if span["text"].strip():  # Only include non-empty text
                            segment = {
                                "segment_id": f"p{page_num}_b{block_idx}_l{line_idx}_s{span_idx}",
                                "text": span["text"],
                                "bbox": span["bbox"],  # [x0, y0, x1, y1]
                                "font": span["font"],
                                "size": span["size"],
                                "flags": span["flags"],  # bold, italic, etc.
                                "color": span["color"],
                                "block_bbox": block["bbox"],
                                "line_bbox": line["bbox"]
                            }
                            page_data["segments"].append(segment)

        document_data["pages"].append(page_data)

    doc.close()
    return document_data

def create_semantic_chunks(document_data: Dict) -> List[Dict]:
    """
    Group segments into semantic chunks while preserving bbox data
    """
    chunks = []

    for page in document_data["pages"]:
        current_chunk = {
            "chunk_id": "",
            "page_num": page["page_num"],
            "text": "",
            "segments": [],  # Keep individual segment bboxes
            "merged_bbox": None,  # Overall bbox for the chunk
            "type": None  # paragraph, heading, list, etc.
        }

        for segment in page["segments"]:
            # Detect semantic boundaries (paragraphs, headings)
            if _is_semantic_boundary(segment, current_chunk):
                if current_chunk["text"].strip():
                    current_chunk["chunk_id"] = _generate_chunk_id(current_chunk)
                    current_chunk["merged_bbox"] = _merge_bboxes(current_chunk["segments"])
                    chunks.append(current_chunk)

                current_chunk = _start_new_chunk(page["page_num"])

            current_chunk["text"] += segment["text"]
            current_chunk["segments"].append({
                "segment_id": segment["segment_id"],
                "text": segment["text"],
                "bbox": segment["bbox"]
            })

    # Don't forget the last chunk
    if current_chunk["text"].strip():
        current_chunk["chunk_id"] = _generate_chunk_id(current_chunk)
        current_chunk["merged_bbox"] = _merge_bboxes(current_chunk["segments"])
        chunks.append(current_chunk)

    return chunks

def _is_semantic_boundary(segment: Dict, current_chunk: Dict) -> bool:
    """Detect if this segment starts a new semantic unit."""
    if not current_chunk["text"]:
        return False

    # Check for large font size changes (headings)
    if current_chunk["segments"]:
        last_segment = current_chunk["segments"][-1]
        if abs(segment["size"] - last_segment.get("size", 12)) > 2:
            return True

    # Check for bold text (potential headings)
    if segment["flags"] & 2**4:  # Bold flag
        return True

    # Check for paragraph breaks (large vertical gaps)
    if current_chunk["segments"]:
        last_bbox = current_chunk["segments"][-1]["bbox"]
        current_bbox = segment["bbox"]

        # If there's a significant vertical gap, start new chunk
        vertical_gap = current_bbox[1] - last_bbox[3]
        if vertical_gap > 20:  # Adjust threshold as needed
            return True

    # Check if chunk is getting too long
    if len(current_chunk["text"]) > 800:
        # Look for natural break points (end of sentence)
        if current_chunk["text"].strip().endswith(('.', '!', '?')):
            return True

    return False

def _start_new_chunk(page_num: int) -> Dict:
    """Initialize a new chunk."""
    return {
        "chunk_id": "",
        "page_num": page_num,
        "text": "",
        "segments": [],
        "merged_bbox": None,
        "type": None
    }

def _generate_chunk_id(chunk: Dict) -> str:
    """Generate a unique chunk ID."""
    page_num = chunk["page_num"]
    text_hash = hashlib.md5(chunk["text"].encode()).hexdigest()[:8]
    return f"page{page_num}_{text_hash}"

def _merge_bboxes(segments: List[Dict]) -> List[float]:
    """Calculate encompassing bbox for multiple segments"""
    if not segments:
        return [0, 0, 100, 100]

    x0 = min(s["bbox"][0] for s in segments)
    y0 = min(s["bbox"][1] for s in segments)
    x1 = max(s["bbox"][2] for s in segments)
    y1 = max(s["bbox"][3] for s in segments)

    return [x0, y0, x1, y1]

def generate_doc_id(pdf_path: str) -> str:
    """Generate a document ID from the PDF path."""
    return os.path.splitext(os.path.basename(pdf_path))[0]

def save_pdf_chunks(doc_id: str, pdf_path: str, output_dir: str = "pdfs"):
    """Extract chunks from PDF and save as JSONL using PyMuPDF."""
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Extract with precise bounding boxes
        document_data = extract_with_bboxes(pdf_path)

        # Create semantic chunks
        chunks = create_semantic_chunks(document_data)

        # Convert to the format expected by the existing system
        jsonl_chunks = []
        for chunk in chunks:
            jsonl_chunks.append({
                "text": chunk["text"].strip(),
                "page_number": float(chunk["page_num"] + 1),  # 1-indexed
                "bbox": chunk["merged_bbox"]
            })

    except Exception as e:
        print(f"Error processing PDF with PyMuPDF: {e}")
        # Fallback to a simple approach
        jsonl_chunks = [{
            "text": f"Uploaded document: {os.path.basename(pdf_path)}. Text extraction failed, but summary generation will still work with this placeholder.",
            "page_number": 1.0,
            "bbox": [100, 100, 500, 150]
        }]

    # Ensure we have at least one chunk
    if not jsonl_chunks:
        jsonl_chunks = [{
            "text": f"Uploaded document: {os.path.basename(pdf_path)}",
            "page_number": 1.0,
            "bbox": [100, 100, 500, 150]
        }]

    jsonl_path = os.path.join(output_dir, f"{doc_id}.jsonl")

    with open(jsonl_path, 'w', encoding='utf-8') as f:
        for chunk in jsonl_chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + '\n')

    return jsonl_path