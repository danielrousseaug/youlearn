import { useState, useEffect, useCallback, useRef } from 'react';

export interface Citation {
  page: number;
  bbox: number[];
  text: string;
  chunk_id: string;
}

export interface StreamData {
  type: 'content' | 'complete' | 'error';
  text?: string;
  citations?: Record<string, Citation>;
  accumulated?: string;
  message?: string;
}

interface UseSummaryStreamReturn {
  summary: string;
  citations: Record<string, Citation>;
  isStreaming: boolean;
  error: string | null;
  startStream: () => void;
  stopStream: () => void;
}

export function useSummaryStream(docId: string): UseSummaryStreamReturn {
  const [summary, setSummary] = useState('');
  const [citations, setCitations] = useState<Record<string, Citation>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reader, setReader] = useState<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Throttle summary updates to prevent constant re-renders
  const [pendingSummary, setPendingSummary] = useState('');
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable citation reference to prevent recreation during streaming
  const citationsRef = useRef<Record<string, Citation>>({});

  // Function to throttle summary updates
  const throttledSetSummary = useCallback((newSummary: string) => {
    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Set new timeout to update summary after delay
    updateTimeoutRef.current = setTimeout(() => {
      setSummary(newSummary);
    }, 25); // Update every 25ms for smooth streaming effect
  }, []);

  // Watch pendingSummary and throttle updates
  useEffect(() => {
    if (pendingSummary && isStreaming) {
      throttledSetSummary(pendingSummary);
    }
  }, [pendingSummary, isStreaming, throttledSetSummary]);

  const stopStream = useCallback(() => {
    if (reader) {
      reader.cancel();
      setReader(null);
    }
    setIsStreaming(false);
  }, []); // Remove reader dependency to prevent re-renders

  const startStream = useCallback(async () => {
    if (isStreaming) return;

    setIsStreaming(true);
    setError(null);
    setSummary('');
    setCitations({});
    citationsRef.current = {};

    try {
      const response = await fetch('http://localhost:8000/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ doc_id: docId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader');
      }

      setReader(reader);
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const data: StreamData = JSON.parse(line);

              if (data.type === 'content') {
                // Use accumulated text if available, otherwise append text chunk
                if (data.accumulated) {
                  throttledSetSummary(data.accumulated);
                } else if (data.text) {
                  setPendingSummary(prev => prev + data.text);
                }
                if (data.citations) {
                  // Update citations without creating new object reference unless necessary
                  setCitations(prev => {
                    let hasChanges = false;
                    const newCitations = { ...prev };

                    for (const [key, citation] of Object.entries(data.citations)) {
                      if (!prev[key] || JSON.stringify(prev[key]) !== JSON.stringify(citation)) {
                        newCitations[key] = citation;
                        hasChanges = true;
                        console.log('[useSummaryStream] New citation added:', { key, citation });
                      }
                    }

                    if (hasChanges) {
                      citationsRef.current = newCitations;
                      console.log('[useSummaryStream] Citations updated:', {
                        totalCitations: Object.keys(newCitations).length,
                        newCitationKeys: Object.keys(data.citations),
                        allKeys: Object.keys(newCitations)
                      });
                      return newCitations;
                    }

                    return prev; // Return same reference if no changes
                  });
                }
              } else if (data.type === 'complete') {
                // Ensure final summary is set when streaming completes
                if (updateTimeoutRef.current) {
                  clearTimeout(updateTimeoutRef.current);
                }
                // Don't override with pendingSummary, just stop streaming
                setIsStreaming(false);
              } else if (data.type === 'error') {
                setError(data.message || 'Unknown error occurred');
                setIsStreaming(false);
                break;
              }
            } catch (parseError) {
              // Skip malformed JSON lines in stream
            }
          }
        }

        // Keep the last incomplete line in the buffer
        buffer = lines[lines.length - 1];
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsStreaming(false);
    } finally {
      setReader(null);
    }
  }, [docId, isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reader) {
        reader.cancel();
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []); // Remove reader dependency to prevent re-renders

  return {
    summary,
    citations,
    isStreaming,
    error,
    startStream,
    stopStream,
  };
}