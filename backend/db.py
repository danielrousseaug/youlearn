"""
Database layer for content management and data retrieval.

This module provides a mock database interface for managing PDF documents
and YouTube video content. It handles content extraction, filtering, and
metadata management for the YouLearn application.

In a production environment, this would be replaced with a proper database
implementation (PostgreSQL, MongoDB, etc.).
"""

import json
import os
from dataclasses import dataclass
from typing import List, Union

# Content storage directories
PDF_PATH = os.path.join(os.path.dirname(__file__), "pdfs")
YOUTUBE_PATH = os.path.join(os.path.dirname(__file__), "youtube")

# Preset PDF documents for demonstration
PRESET_PDFS = {
    "pdf_1": {
        "id": "pdf_1",
        "title": "Attention is all you need",
        "url": "https://youlearn-content-uploads-dev.s3.amazonaws.com/content/e41b2ad827e3418d802ab6ec6387d2b7.pdf",
        "type": "pdf",
        "description": "Transformer architecture paper"
    },
    "pdf_2": {
        "id": "pdf_2",
        "title": "The Chemical Basis of Life",
        "url": "https://youlearn-content-uploads-dev.s3.amazonaws.com/content/52791629ab8b41448df2082bd2f045e2.pdf",
        "type": "pdf",
        "description": "Chemistry textbook"
    },
    "pdf_3": {
        "id": "pdf_3",
        "title": "Technik",
        "url": "https://youlearn-content-uploads-dev.s3.amazonaws.com/content/8777db346d724c168acd1b3d15b8c659.pdf",
        "type": "pdf",
        "description": "German bicycle magazine"
    },
}

# Maintain backward compatibility
EXAMPLES = PRESET_PDFS


@dataclass
class PDFExtract:
    """Represents a text extract from a PDF document with location information."""
    text: str              # Extracted text content
    page_number: int       # Page number (1-indexed)
    bbox: List[float]      # Bounding box coordinates [x1, y1, x2, y2]


@dataclass
class YouTubeExtract:
    """Represents a text extract from a YouTube video transcript with timing information."""
    text: str          # Transcript text segment
    start_time: float  # Start time in seconds
    duration: float    # Duration of segment in seconds
    end_time: float    # End time in seconds

def get_pdf_extracts(doc_id: str) -> List[PDFExtract]:
    """
    Load and filter PDF text extracts from JSONL file.

    Args:
        doc_id: Document identifier (e.g., 'pdf_1', 'pdf_2', 'pdf_3')

    Returns:
        List of PDFExtract objects containing text, page number, and bounding box

    Raises:
        FileNotFoundError: If the JSONL file for the document doesn't exist
    """
    jsonl_path = os.path.join(PDF_PATH, f"{doc_id}.jsonl")
    if not os.path.exists(jsonl_path):
        raise FileNotFoundError(f"JSONL file not found: {jsonl_path}")

    extracts = []
    try:
        with open(jsonl_path, "r", encoding="utf-8") as file:
            for line_num, line in enumerate(file, 1):
                line = line.strip()
                if not line:
                    continue

                try:
                    item = json.loads(line)

                    # Validate required fields
                    if not all(key in item for key in ['text', 'page_number', 'bbox']):
                        print(f"Warning: Skipping line {line_num} in {jsonl_path} - missing required fields")
                        continue

                    # Filter out unwanted chunks using content filtering
                    if should_include_chunk(item['text']):
                        extracts.append(PDFExtract(
                            text=item['text'],
                            page_number=item['page_number'],
                            bbox=item['bbox']
                        ))

                except json.JSONDecodeError as e:
                    print(f"Warning: Skipping malformed JSON on line {line_num} in {jsonl_path}: {e}")
                    continue

    except Exception as e:
        raise Exception(f"Error reading PDF extracts from {jsonl_path}: {e}")

    return extracts

def get_youtube_extracts(video_id: str) -> List[YouTubeExtract]:
    jsonl_path = os.path.join(YOUTUBE_PATH, f"{video_id}.jsonl")
    if not os.path.exists(jsonl_path):
        raise FileNotFoundError(f"JSONL file not found: {jsonl_path}")

    extracts = []
    with open(jsonl_path, "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)

            # Filter out unwanted chunks (apply similar filtering as PDFs)
            if should_include_chunk(item['text']):
                extracts.append(YouTubeExtract(
                    text=item['text'],
                    start_time=item['start_time'],
                    duration=item['duration'],
                    end_time=item['end_time']
                ))

    return extracts

def get_extracts(doc_id: str) -> List[Union[PDFExtract, YouTubeExtract]]:
    """
    Get extracts for either PDF or YouTube content based on doc_id.
    Returns appropriate extract type based on content.
    """
    # Check if it's a YouTube video ID (11 characters) or has youtube prefix
    if len(doc_id) == 11 or doc_id.startswith('youtube_'):
        video_id = doc_id.replace('youtube_', '') if doc_id.startswith('youtube_') else doc_id
        return get_youtube_extracts(video_id)
    else:
        return get_pdf_extracts(doc_id)

def is_youtube_content(doc_id: str) -> bool:
    """Check if doc_id refers to YouTube content."""
    return len(doc_id) == 11 or doc_id.startswith('youtube_') or os.path.exists(os.path.join(YOUTUBE_PATH, f"{doc_id}.jsonl"))

def should_include_chunk(text: str) -> bool:
    """
    Filter out chunks that are likely diagrams, chemical symbols, or other non-meaningful content
    """
    text = text.strip()

    # Skip empty or very short text
    if len(text) < 3:
        return False

    # Skip single characters or simple symbols
    if len(text) == 1:
        return False

    # Skip simple mathematical/chemical notation
    if text in ['+', '-', '=', '×', '÷', '→', '←', '↑', '↓']:
        return False

    # Skip parenthetical labels like (a), (b), (1), (2), etc.
    if len(text) <= 4 and text.startswith('(') and text.endswith(')'):
        return False

    # Skip pure numbers (but allow numbers with text)
    if text.isdigit():
        return False

    # Skip chemical formulas and symbols
    if len(text) <= 15:
        # Skip anything with + or - symbols (likely chemical equations)
        if '+' in text or '- ' in text or '_' in text:
            return False

        # Check for chemical formula patterns
        if any(char in text for char in ['H', 'O', 'C', 'N']) and any(char.isdigit() for char in text):
            return False

        # Skip repeated characters like "H20H20"
        if len(set(text.upper())) <= 3 and any(char.isdigit() for char in text):
            return False

        # Skip single words that are likely chemical terms
        if len(text.split()) == 1 and any(char in text.upper() for char in ['H', 'O', 'C', 'N']):
            return False

    # Skip figure/table references
    if text.lower().startswith(('fig', 'figure', 'table', 'tab')):
        return False

    # Skip image placeholders
    if text.strip() == "[Image]" or text.strip().lower() == "image":
        return False

    # Keep everything else (substantial text content)
    return True

def get_youtube_information(video_id: str) -> dict:
    """Get YouTube video information."""
    from youtube_processor import get_video_info
    info = get_video_info(video_id)
    return {
        "id": video_id,
        "title": info["title"],
        "url": info["url"],
        "embed_url": info["embed_url"],
        "type": "youtube"
    }

def get_pdf_information(doc_id: str) -> dict:
    return EXAMPLES[doc_id]

def get_content_information(doc_id: str) -> dict:
    """
    Get information for either PDF or YouTube content based on doc_id.
    """
    if is_youtube_content(doc_id):
        video_id = doc_id.replace('youtube_', '') if doc_id.startswith('youtube_') else doc_id
        return get_youtube_information(video_id)
    else:
        return get_pdf_information(doc_id)