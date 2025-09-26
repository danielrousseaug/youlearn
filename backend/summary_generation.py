import json
from typing import AsyncGenerator, List, Dict, Any
from openai import AsyncOpenAI
import os
import asyncio
from db import get_pdf_extracts, PDFExtract

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

def create_prompt_with_chunks(extracts: List[PDFExtract]) -> str:
    """Create a prompt with numbered chunks for citation."""
    chunks_text = ""
    for i, extract in enumerate(extracts, 1):
        # Truncate very long chunks but keep them meaningful
        text_preview = extract.text[:300] + "..." if len(extract.text) > 300 else extract.text
        chunks_text += f"[{i}] Page {int(extract.page_number)}: {text_preview}\n\n"

    prompt = f"""You are an expert document summarizer. Create a comprehensive, detailed summary with precise inline citations.

CONTENT REQUIREMENTS:
- Write a thorough, detailed summary (aim for 800-1200 words)
- Cover all major sections, concepts, and findings from the document
- Include specific details, methodologies, results, and conclusions
- Explain complex concepts clearly and comprehensively
- Provide context and background for technical terms

CITATION RULES - CRITICAL:
- ALWAYS use square brackets with numbers: [1], [2], [3] - NEVER use any other format
- NEVER use formats like CITATION_0, **CITATION_1**, or similar patterns
- Every factual claim must include a citation immediately after the statement
- Use only numbers 1-{len(extracts)} (the total chunks available)
- Multiple citations: [1,2,3] when combining information from multiple chunks
- Do NOT create a separate "Citations" or "References" section at the end
- Citations should ONLY appear inline within the text
- Example: "The Transformer model uses attention mechanisms [1] and achieves state-of-the-art results [2,3]."

FORMATTING REQUIREMENTS:
- Use proper markdown headers (##, ###, ####)
- Use bullet points and numbered lists where appropriate
- Keep citations inline with the text, never separate them
- Include detailed explanations of key concepts and methodologies
- Structure with clear sections covering all major aspects

Available chunks ({len(extracts)} total):
{chunks_text}

Create a comprehensive, detailed markdown summary with inline citations only:"""

    return prompt

def parse_chunk_for_citations(chunk_text: str, extracts: List[PDFExtract]) -> Dict[str, Any]:
    """Parse a chunk of text and extract citation mapping."""
    citations = {}

    # Find all citation patterns like [1], [2], [1,2,3], etc.
    import re
    citation_pattern = r'\[(\d+(?:,\s*\d+)*)\]'
    matches = re.finditer(citation_pattern, chunk_text)

    for match in matches:
        citation_text = match.group(0)  # e.g., "[1]" or "[1,2,3]"
        citation_nums = [int(n.strip()) for n in match.group(1).split(',')]

        for num in citation_nums:
            if 1 <= num <= len(extracts):
                extract = extracts[num - 1]
                # Create more meaningful text preview
                text_preview = extract.text.strip()
                if len(text_preview) > 150:
                    # Try to cut at sentence boundary
                    sentences = text_preview.split('. ')
                    if len(sentences) > 1:
                        text_preview = sentences[0] + '.'
                    else:
                        text_preview = text_preview[:150] + "..."

                citations[str(num)] = {
                    "page": int(extract.page_number),
                    "bbox": extract.bbox,
                    "text": text_preview,
                    "chunk_id": f"page{int(extract.page_number)}_chunk{num}",
                    "full_text": extract.text[:500]  # More context for debugging
                }

    return citations

async def generate_summary_stream(doc_id: str) -> AsyncGenerator[str, None]:
    """
    Generate a streaming summary of the document with citations.
    """
    try:
        # Get PDF extracts from database
        extracts = get_pdf_extracts(doc_id)

        # Create prompt with numbered chunks
        prompt = create_prompt_with_chunks(extracts)

        # Call OpenRouter API with streaming
        response = await client.chat.completions.create(
            model="openai/gpt-4o-mini",  # Using a fast, efficient model
            messages=[
                {"role": "system", "content": "You are a helpful assistant that creates detailed summaries with accurate citations."},
                {"role": "user", "content": prompt}
            ],
            stream=True,
            temperature=0.3,  # Lower temperature for more consistent citations
            max_tokens=4000  # Increased for longer, more detailed summaries
        )

        # Stream the response
        accumulated_text = ""
        async for chunk in response:
            if chunk.choices[0].delta.content:
                text_chunk = chunk.choices[0].delta.content
                accumulated_text += text_chunk

                # Extract citations from the accumulated text
                citations = parse_chunk_for_citations(accumulated_text, extracts)

                # Send the chunk with citation metadata
                data = {
                    "type": "content",
                    "text": text_chunk,
                    "citations": citations,
                    "accumulated": accumulated_text
                }
                yield json.dumps(data) + "\n"

                # Small delay for smooth streaming
                await asyncio.sleep(0.01)

        # Send completion signal
        yield json.dumps({"type": "complete", "message": "Summary generation complete"}) + "\n"

    except Exception as e:
        # Send error if something goes wrong
        error_data = {"type": "error", "message": str(e)}
        yield json.dumps(error_data) + "\n"