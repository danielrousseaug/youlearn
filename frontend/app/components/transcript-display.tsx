"use client";
import { useEffect, useRef, useState } from 'react';

interface TranscriptSegment {
  start_time: number;
  duration: number;
  end_time: number;
  text: string;
  timestamp_display: string;
}

interface TranscriptDisplayProps {
  videoId: string;
  currentTime?: number;
  onSeekToTime?: (time: number) => void;
  className?: string;
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  videoId,
  currentTime = 0,
  onSeekToTime,
  className
}) => {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  // Fetch transcript segments
  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:8000/youtube-transcript/${videoId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch transcript: ${response.status}`);
        }

        const data = await response.json();
        setTranscript(data.segments || []);
        setError(null);
      } catch (err) {
        setError('Failed to load transcript');
        console.error('Error fetching transcript:', err);

        // Fallback to mock data if transcript fails
        const fallbackTranscript: TranscriptSegment[] = [
          {
            start_time: 0,
            duration: 60,
            end_time: 60,
            text: "Transcript not available for this video. You can still generate a summary.",
            timestamp_display: "00:00 - 01:00"
          }
        ];
        setTranscript(fallbackTranscript);
      } finally {
        setLoading(false);
      }
    };

    if (videoId) {
      fetchTranscript();
    }
  }, [videoId]);

  // Find active segment based on current time
  const activeSegmentIndex = transcript.findIndex(
    segment => currentTime >= segment.start_time && currentTime < segment.end_time
  );

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentRef.current) {
      // Find the scrollable parent container
      let scrollableParent = activeSegmentRef.current.parentElement;
      while (scrollableParent &&
             !scrollableParent.classList.contains('overflow-y-auto') &&
             scrollableParent !== document.body) {
        scrollableParent = scrollableParent.parentElement;
      }

      if (scrollableParent && scrollableParent !== document.body) {
        const activeElement = activeSegmentRef.current;
        const containerTop = scrollableParent.scrollTop;
        const containerBottom = containerTop + scrollableParent.clientHeight;
        const elementTop = activeElement.offsetTop - scrollableParent.offsetTop;
        const elementBottom = elementTop + activeElement.clientHeight;

        if (elementTop < containerTop || elementBottom > containerBottom) {
          activeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      } else {
        // Fallback to simple scrollIntoView
        activeSegmentRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [activeSegmentIndex]);

  const handleSegmentClick = (segment: TranscriptSegment) => {
    if (onSeekToTime) {
      onSeekToTime(segment.start_time);
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading transcript...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <div className="text-red-500 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Video Transcript
        </h3>
      </div>

      <div
        ref={transcriptRef}
        className="space-y-3"
      >
        {transcript.map((segment, index) => (
          <div
            key={index}
            ref={index === activeSegmentIndex ? activeSegmentRef : null}
            onClick={() => handleSegmentClick(segment)}
            className={`
              cursor-pointer p-3 rounded-lg transition-all duration-200
              ${index === activeSegmentIndex
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
              }
            `}
          >
            <div className="flex items-start gap-3">
              <div className={`
                flex-shrink-0 text-xs font-mono px-2 py-1 rounded
                ${index === activeSegmentIndex
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }
              `}>
                {formatTimestamp(segment.start_time)}
              </div>
              <div className={`
                text-sm leading-relaxed break-words
                ${index === activeSegmentIndex
                  ? 'text-neutral-900 dark:text-white font-medium'
                  : 'text-neutral-700 dark:text-neutral-300'
                }
              `}>
                {segment.text}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptDisplay;