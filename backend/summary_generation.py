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

    prompt = f"""You are an expert document summarizer. Create a comprehensive, bullet-point focused summary with precise inline citations.

CONTENT REQUIREMENTS:
- Write a thorough, detailed summary (aim for 800-1200 words)
- USE BULLET POINTS AS THE PRIMARY FORMAT - avoid long paragraphs
- Each bullet point should be a complete, informative statement
- Cover all major sections, concepts, and findings from the document
- Include specific details, methodologies, results, and conclusions
- Group related bullet points under clear section headers

CITATION RULES - CRITICAL:
- ALWAYS use square brackets with numbers: [1], [2], [3] - NEVER use any other format
- NEVER use formats like CITATION_0, **CITATION_1**, or similar patterns
- NEVER use range notation like [30-32] or [75-79] - use individual citations [30], [31], [32]
- Every factual claim must include a citation immediately after the statement
- Use only numbers 1-{len(extracts)} (the total chunks available)
- Multiple citations: [1,2,3] when combining information from multiple chunks
- PREFER individual citations over ranges for better navigation: [30], [31], [32] instead of [30-32]
- Do NOT create a separate "Citations" or "References" section at the end
- Citations should ONLY appear inline within the text
- Example: "• The Transformer model uses attention mechanisms [1] and achieves state-of-the-art results [2,3]"

FORMATTING REQUIREMENTS:
- Use proper markdown headers (##, ###) for major sections
- PRIMARILY USE BULLET POINTS (•) for content
- Keep each bullet point concise but informative (1-2 sentences)
- Use sub-bullets for related details
- Keep citations inline with the bullet points
- Structure with clear sections covering all major aspects
- Avoid long paragraphs - break information into digestible bullet points
- Example format:
  ## Section Name
  • Key finding or concept with explanation [1]
  • Another important point with specific details [2,3]
    - Supporting detail or example [4]
    - Additional context [5]
  • Next major point [6]

Available chunks ({len(extracts)} total):
{chunks_text}

Create a comprehensive, bullet-point focused markdown summary with inline citations only:"""

    return prompt

def parse_chunk_for_citations(chunk_text: str, extracts: List[PDFExtract]) -> Dict[str, Any]:
    """Parse a chunk of text and extract citation mapping."""
    citations = {}

    # Find all citation patterns like [1], [2], [1,2,3], [30-32], etc.
    import re
    citation_pattern = r'\[(\d+(?:[-,]\s*\d+)*)\]'
    matches = re.finditer(citation_pattern, chunk_text)

    for match in matches:
        citation_text = match.group(0)  # e.g., "[1]" or "[1,2,3]" or "[30-32]"
        citation_content = match.group(1)

        # Parse citation numbers - handle both comma lists and ranges
        citation_nums = []
        if '-' in citation_content:
            # Handle ranges like [30-32] or [75-79]
            parts = citation_content.split('-')
            if len(parts) == 2:
                try:
                    start = int(parts[0].strip())
                    end = int(parts[1].strip())
                    citation_nums = list(range(start, end + 1))
                except ValueError:
                    # Fallback to treating as comma-separated
                    citation_nums = [int(n.strip()) for n in citation_content.replace('-', ',').split(',')]
            else:
                # Multiple dashes or complex format - treat as comma-separated
                citation_nums = [int(n.strip()) for n in citation_content.replace('-', ',').split(',')]
        else:
            # Handle comma-separated lists like [1,2,3]
            citation_nums = [int(n.strip()) for n in citation_content.split(',')]

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
            model="openai/gpt-4o",  # Using GPT-4o (GPT-5 not available yet)
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