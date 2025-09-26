# Mock database to query from
import json
import os
from dataclasses import dataclass
from typing import List

PATH = os.path.join(os.path.dirname(__file__), "pdfs")
EXAMPLES = {
    "pdf_1": {
        "id": "pdf_1",
        "title": "Attention is all you need",
        "url": "https://youlearn-content-uploads-dev.s3.amazonaws.com/content/e41b2ad827e3418d802ab6ec6387d2b7.pdf"
    },
    "pdf_2": {
        "id": "pdf_2",
        "title": "The Chemical Basis of Life",
        "url": "https://youlearn-content-uploads-dev.s3.amazonaws.com/content/52791629ab8b41448df2082bd2f045e2.pdf"
    },
    "pdf_3": {
        "id": "pdf_3",
        "title": "Technik",
        "url": "https://youlearn-content-uploads-dev.s3.amazonaws.com/content/8777db346d724c168acd1b3d15b8c659.pdf"
    },
}

@dataclass
class PDFExtract:
    text: str
    page_number: int
    bbox: List[float]

def get_pdf_extracts(doc_id: str) -> List[PDFExtract]:
    jsonl_path = os.path.join(PATH, f"{doc_id}.jsonl")
    if not os.path.exists(jsonl_path):
        raise FileNotFoundError(f"JSONL file not found: {jsonl_path}")

    extracts = []
    with open(jsonl_path, "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)

            # Filter out unwanted chunks
            if should_include_chunk(item['text']):
                extracts.append(PDFExtract(
                    text=item['text'],
                    page_number=item['page_number'],
                    bbox=item['bbox']
                ))

    return extracts

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

def get_pdf_information(doc_id: str) -> dict:
    return EXAMPLES[doc_id]