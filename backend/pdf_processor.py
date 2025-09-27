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
    Group segments into meaningful paragraph-sized chunks while preserving bbox data.
    Creates larger, more semantic chunks similar to the preset PDFs.
    """
    chunks = []

    for page in document_data["pages"]:
        # First, group segments into lines for better text flow detection
        lines = _group_segments_into_lines(page["segments"])

        current_chunk = {
            "chunk_id": "",
            "page_num": page["page_num"],
            "text": "",
            "segments": [],  # Keep individual segment bboxes
            "merged_bbox": None,  # Overall bbox for the chunk
            "type": None  # paragraph, heading, list, etc.
        }

        for line in lines:
            # Detect semantic boundaries at line level for larger chunks
            if _is_paragraph_boundary(line, current_chunk, lines):
                if current_chunk["text"].strip():
                    current_chunk["chunk_id"] = _generate_chunk_id(current_chunk)
                    current_chunk["merged_bbox"] = _merge_bboxes(current_chunk["segments"])
                    chunks.append(current_chunk)

                current_chunk = _start_new_chunk(page["page_num"])

            # Add entire line to chunk
            line_text = " ".join([seg["text"] for seg in line["segments"]])
            current_chunk["text"] += line_text + " "
            current_chunk["segments"].extend([{
                "segment_id": seg["segment_id"],
                "text": seg["text"],
                "bbox": seg["bbox"]
            } for seg in line["segments"]])

        # Don't forget the last chunk
        if current_chunk["text"].strip():
            current_chunk["chunk_id"] = _generate_chunk_id(current_chunk)
            current_chunk["merged_bbox"] = _merge_bboxes(current_chunk["segments"])
            chunks.append(current_chunk)

    return chunks

def _group_segments_into_lines(segments: List[Dict]) -> List[Dict]:
    """Group segments that are on the same line together."""
    if not segments:
        return []

    lines = []
    current_line = {"segments": [segments[0]], "bbox": segments[0]["bbox"]}

    for segment in segments[1:]:
        # Check if this segment is on the same line as the current line
        # Two segments are on same line if their vertical positions overlap significantly
        current_line_y_center = (current_line["bbox"][1] + current_line["bbox"][3]) / 2
        segment_y_center = (segment["bbox"][1] + segment["bbox"][3]) / 2

        # If vertical centers are close, consider them same line
        if abs(current_line_y_center - segment_y_center) < 10:
            # Same line - extend the line bbox and add segment
            current_line["segments"].append(segment)
            current_line["bbox"] = [
                min(current_line["bbox"][0], segment["bbox"][0]),  # min x0
                min(current_line["bbox"][1], segment["bbox"][1]),  # min y0
                max(current_line["bbox"][2], segment["bbox"][2]),  # max x1
                max(current_line["bbox"][3], segment["bbox"][3])   # max y1
            ]
        else:
            # New line - save current line and start new one
            lines.append(current_line)
            current_line = {"segments": [segment], "bbox": segment["bbox"]}

    # Don't forget the last line
    lines.append(current_line)
    return lines

def _is_paragraph_boundary(line: Dict, current_chunk: Dict, all_lines: List[Dict]) -> bool:
    """Detect if this line starts a new chunk while keeping paragraphs intact."""
    if not current_chunk["text"]:
        return False

    # Get the line text for analysis
    line_text = " ".join([seg["text"] for seg in line["segments"]])

    # Check for section headers (like "1 Introduction", "2 Background")
    import re
    if re.match(r'^\d+\s*[A-Z][a-z]', line_text.strip()):
        return True

    # Check for standalone section titles (like "Abstract", "Introduction")
    section_keywords = ['abstract', 'introduction', 'background', 'related work', 'methodology',
                       'method', 'approach', 'experiments', 'results', 'discussion', 'conclusion',
                       'references', 'acknowledgments']
    if line_text.strip().lower() in section_keywords:
        return True

    # Check for font size changes (headings) - major structural changes
    if current_chunk["segments"] and line["segments"]:
        last_size = current_chunk["segments"][-1].get("size", 12)
        current_size = line["segments"][0].get("size", 12)

        # Break on significant font size changes (major headings)
        if abs(current_size - last_size) > 3:  # Only major font changes
            return True

    # Check for bold text changes (headings, emphasis) - but be more selective
    if current_chunk["segments"] and line["segments"]:
        last_flags = current_chunk["segments"][-1].get("flags", 0)
        current_flags = line["segments"][0].get("flags", 0)

        # Only break on bold changes if it's likely a heading (short line)
        last_is_bold = bool(last_flags & 2**4)
        current_is_bold = bool(current_flags & 2**4)
        if last_is_bold != current_is_bold and len(line_text.strip()) < 50:  # Short bold text = likely heading
            return True

    # MAIN PARAGRAPH BOUNDARY DETECTION
    # Only break on significant vertical gaps that indicate true paragraph breaks
    if current_chunk["segments"]:
        last_segment = current_chunk["segments"][-1]
        last_bottom = last_segment["bbox"][3]
        current_top = line["bbox"][1]

        vertical_gap = current_top - last_bottom

        # Only break on larger gaps that clearly separate paragraphs
        # AND only if current chunk ends with sentence punctuation (complete thought)
        if (vertical_gap > 15 and
            current_chunk["text"].strip().endswith(('.', '!', '?', ':')) and
            len(current_chunk["text"].strip()) > 100):  # Ensure we have substantial content
            return True

    # For very long chunks, only break at clear paragraph boundaries
    # Don't break mid-paragraph just because of length
    if len(current_chunk["text"]) > 1200:
        # Only break if we're at end of paragraph (sentence ending + gap to next line)
        if (current_chunk["text"].strip().endswith(('.', '!', '?')) and
            current_chunk["segments"]):

            # Check if there's a gap to the next line (paragraph break)
            last_segment = current_chunk["segments"][-1]
            last_bottom = last_segment["bbox"][3]
            current_top = line["bbox"][1]
            vertical_gap = current_top - last_bottom

            if vertical_gap > 8:  # Some gap indicates paragraph break
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