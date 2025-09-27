"""YouTube transcript processing utilities for extracting transcripts with timestamps."""
import json
import os
import re
import hashlib
from typing import List, Dict, Optional
from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs

def extract_video_id(youtube_url: str) -> Optional[str]:
    """
    Extract a YouTube video ID from a wide variety of URL formats or a bare ID.

    Supported examples (not exhaustive):
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://youtube.com/embed/VIDEO_ID
    - https://m.youtube.com/watch?v=VIDEO_ID
    - https://www.youtube.com/shorts/VIDEO_ID
    - https://www.youtube.com/live/VIDEO_ID
    - https://www.youtube.com/v/VIDEO_ID
    - VIDEO_ID (bare 11-character ID)
    """
    if not youtube_url:
        return None

    candidate = youtube_url.strip()

    # Accept a bare 11-character ID directly
    if re.fullmatch(r"[a-zA-Z0-9_-]{11}", candidate):
        return candidate

    # Handle youtu.be short URLs quickly
    if 'youtu.be/' in candidate:
        return candidate.split('youtu.be/')[-1].split('?')[0].split('&')[0].split('/')[0]

    # Ensure urlparse can parse even if scheme is missing
    url_to_parse = candidate if re.match(r'^https?://', candidate) else f'https://{candidate}'
    parsed_url = urlparse(url_to_parse)

    host = (parsed_url.hostname or '').lower()
    path = parsed_url.path or ''

    # Common YouTube hosts
    yt_hosts = {
        'youtube.com', 'www.youtube.com', 'm.youtube.com',
        'youtu.be', 'www.youtu.be'
    }

    if host in yt_hosts:
        # Patterns by path
        if path == '/watch':
            query_params = parse_qs(parsed_url.query)
            vid = query_params.get('v', [None])[0]
            if vid and re.fullmatch(r"[a-zA-Z0-9_-]{11}", vid):
                return vid
        # /embed/VIDEO_ID
        if '/embed/' in path:
            vid = path.split('/embed/')[-1].split('?')[0].split('/')[0]
            if re.fullmatch(r"[a-zA-Z0-9_-]{11}", vid):
                return vid
        # /shorts/VIDEO_ID
        if '/shorts/' in path:
            vid = path.split('/shorts/')[-1].split('?')[0].split('/')[0]
            if re.fullmatch(r"[a-zA-Z0-9_-]{11}", vid):
                return vid
        # /live/VIDEO_ID
        if '/live/' in path:
            vid = path.split('/live/')[-1].split('?')[0].split('/')[0]
            if re.fullmatch(r"[a-zA-Z0-9_-]{11}", vid):
                return vid
        # /v/VIDEO_ID (legacy)
        if path.startswith('/v/'):
            vid = path.split('/v/')[-1].split('?')[0].split('/')[0]
            if re.fullmatch(r"[a-zA-Z0-9_-]{11}", vid):
                return vid

    # Fallback: search the whole string for accepted tokens followed by an ID
    fallback_pattern = r'(?:v=|vi=|embed/|shorts/|live/|youtu\.be/|/v/)([a-zA-Z0-9_-]{11})'
    match = re.search(fallback_pattern, candidate)
    if match:
        return match.group(1)

    return None

def get_video_info(video_id: str) -> Dict:
    """
    Get basic video information. In a real implementation, you might want to use
    the YouTube Data API to get title, description, etc.
    """
    return {
        "id": video_id,
        "title": f"YouTube Video {video_id}",
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "embed_url": f"https://www.youtube.com/embed/{video_id}"
    }

def extract_transcript(video_id: str) -> List[Dict]:
    """
    Extract transcript from YouTube video using youtube-transcript-api.

    Returns a list of transcript segments with text, start time, and duration.
    """
    try:
        # Try to get the transcript using the correct API
        api = YouTubeTranscriptApi()

        # Try English first, then English-US, then any available language
        languages_to_try = [['en'], ['en-US'], ['en-GB'], None]

        for languages in languages_to_try:
            try:
                if languages:
                    transcript_response = api.fetch(video_id, languages=languages)
                else:
                    # Try without language restriction - get first available
                    transcript_response = api.fetch(video_id)

                # Convert FetchedTranscript to list of dicts
                transcript_data = []
                for snippet in transcript_response:
                    transcript_data.append({
                        'text': snippet.text,
                        'start': snippet.start,
                        'duration': snippet.duration
                    })
                return transcript_data

            except Exception as lang_error:
                continue

        # If we get here, no transcript was found
        raise Exception("No transcript available for this video")

    except Exception as e:
        raise Exception(f"Failed to extract transcript: {str(e)}")

def create_natural_chunks(transcript_data: List[Dict], target_duration: int = 10) -> List[Dict]:
    """
    Group natural YouTube transcript segments into reasonable chunks.
    Combines segments up to target_duration while respecting natural breaks.

    Args:
        transcript_data: List of transcript segments from YouTube API
        target_duration: Target duration for each chunk in seconds

    Returns:
        List of grouped chunks with natural segment boundaries
    """
    if not transcript_data:
        return []

    chunks = []
    current_chunk = {
        "chunk_id": "",
        "text": "",
        "start_time": transcript_data[0]['start'],
        "end_time": transcript_data[0]['start'],
        "duration": 0,
        "segments": []
    }

    for segment in transcript_data:
        segment_start = segment['start']
        segment_duration = segment.get('duration', 3.0)
        segment_end = segment_start + segment_duration
        segment_text = segment['text'].strip()

        # Skip empty segments
        if not segment_text:
            continue

        # Check if we should start a new chunk
        if (current_chunk["text"] and
            (segment_start - current_chunk["start_time"] >= target_duration or
             len(current_chunk["text"]) > 500)):

            # Finalize current chunk
            current_chunk["chunk_id"] = _generate_chunk_id(current_chunk)
            current_chunk["duration"] = current_chunk["end_time"] - current_chunk["start_time"]
            chunks.append(current_chunk)

            # Start new chunk
            current_chunk = {
                "chunk_id": "",
                "text": "",
                "start_time": segment_start,
                "end_time": segment_end,
                "duration": 0,
                "segments": []
            }

        # Add segment to current chunk
        if current_chunk["text"]:
            current_chunk["text"] += " " + segment_text
        else:
            current_chunk["text"] = segment_text
            current_chunk["start_time"] = segment_start

        current_chunk["end_time"] = segment_end
        current_chunk["segments"].append({
            "text": segment_text,
            "start": segment_start,
            "duration": segment_duration
        })

    # Don't forget the last chunk
    if current_chunk["text"].strip():
        current_chunk["chunk_id"] = _generate_chunk_id(current_chunk)
        current_chunk["duration"] = current_chunk["end_time"] - current_chunk["start_time"]
        chunks.append(current_chunk)

    return chunks

def _generate_chunk_id(chunk: Dict) -> str:
    """Generate a unique chunk ID based on start time and text."""
    start_time = int(chunk["start_time"])
    text_hash = hashlib.md5(chunk["text"].encode()).hexdigest()[:8]
    return f"time{start_time}_{text_hash}"

def format_timestamp(seconds: float) -> str:
    """Convert seconds to MM:SS format."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"

def save_youtube_chunks(video_id: str, youtube_url: str, output_dir: str = "youtube") -> str:
    """
    Extract transcript from YouTube video and save as JSONL.

    Args:
        video_id: YouTube video ID
        youtube_url: Full YouTube URL
        output_dir: Directory to save transcript chunks

    Returns:
        Path to the saved JSONL file
    """
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Extract transcript
        transcript_data = extract_transcript(video_id)

        # Create natural chunks
        chunks = create_natural_chunks(transcript_data)

        # Convert to JSONL format compatible with existing system
        jsonl_chunks = []
        for chunk in chunks:
            jsonl_chunks.append({
                "text": chunk["text"].strip(),
                "start_time": chunk["start_time"],
                "duration": chunk["duration"],
                "end_time": chunk["end_time"],
                "timestamp_display": f"{format_timestamp(chunk['start_time'])} - {format_timestamp(chunk['end_time'])}"
            })

    except Exception as e:
        print(f"Error processing YouTube video: {e}")
        # Fallback chunk
        jsonl_chunks = [{
            "text": f"YouTube video: {youtube_url}. Transcript extraction failed, but summary generation will still work with this placeholder.",
            "start_time": 0.0,
            "duration": 60.0,
            "end_time": 60.0,
            "timestamp_display": "00:00 - 01:00"
        }]

    # Ensure we have at least one chunk
    if not jsonl_chunks:
        jsonl_chunks = [{
            "text": f"YouTube video: {youtube_url}",
            "start_time": 0.0,
            "duration": 60.0,
            "end_time": 60.0,
            "timestamp_display": "00:00 - 01:00"
        }]

    # Save to JSONL file
    jsonl_path = os.path.join(output_dir, f"{video_id}.jsonl")

    with open(jsonl_path, 'w', encoding='utf-8') as f:
        for chunk in jsonl_chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + '\n')

    print(f"Saved {len(jsonl_chunks)} transcript chunks to {jsonl_path}")
    return jsonl_path