"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import EnhancedPdfViewer, { PdfViewerHandle } from "../components/enhanced-pdf-viewer";
import YouTubePlayer, { YouTubePlayerHandle } from "../components/youtube-player";
import TranscriptDisplay from "../components/transcript-display";
import CitationRenderer from "../components/citation-renderer";
import ResizableLayout from "../components/resizable-layout";
import { useSummaryStream, Citation } from "../../hooks/useSummaryStream";
import { addDebugLog } from "../components/citation-debug";

export default function ContentViewerPage() {
    const searchParams = useSearchParams();
    const docId = searchParams.get('src') || 'pdf_1';
    const [contentUrl, setContentUrl] = useState<string>("");
    const [contentTitle, setContentTitle] = useState<string>("Loading...");
    const [contentType, setContentType] = useState<'pdf' | 'youtube'>('pdf');
    const [activeHighlight, setActiveHighlight] = useState<{ page: number; bbox: number[] } | null>(null);

    // Memoize highlights array to prevent unnecessary re-renders of PDF viewer
    const highlights = useMemo(() => {
        return activeHighlight ? [activeHighlight] : [];
    }, [activeHighlight]);

    const pdfViewerRef = useRef<PdfViewerHandle>(null);
    const youtubePlayerRef = useRef<YouTubePlayerHandle>(null);
    const [currentVideoTime, setCurrentVideoTime] = useState(0);
    const { summary, citations, isStreaming, error, startStream } = useSummaryStream(docId);

    // Fetch content information
    useEffect(() => {
        const fetchContentInfo = async () => {
            try {
                const response = await fetch(`http://localhost:8000/content/${docId}`);
                if (response.ok) {
                    const data = await response.json();
                    setContentUrl(data.url || data.embed_url);
                    setContentTitle(data.title || "Content");
                    setContentType(data.type || 'pdf');
                }
            } catch (err) {
                // Fallback to PDF endpoint for backward compatibility
                try {
                    const response = await fetch(`http://localhost:8000/pdf/${docId}`);
                    if (response.ok) {
                        const data = await response.json();
                        setContentUrl(data.url);
                        setContentTitle(data.title || "PDF Document");
                        setContentType('pdf');
                    }
                } catch (err2) {
                    // Failed to fetch content info
                }
            }
        };

        fetchContentInfo();
    }, [docId]);

    // Auto-start streaming when component mounts
    useEffect(() => {
        if (contentUrl) {
            startStream();
        }
    }, [contentUrl]);

    // Create stable citation click handler to prevent re-renders
    const handleCitationClick = useCallback(async (citationId: string, citation: Citation) => {
        if (contentType === 'youtube') {
            // Handle YouTube timestamp navigation
            addDebugLog('youtube_operation', {
                action: 'CITATION_CLICK_RECEIVED',
                citationId,
                startTime: citation.start_time,
                hasYouTubeRef: !!youtubePlayerRef.current
            });

            if (youtubePlayerRef.current && citation.start_time !== undefined) {
                youtubePlayerRef.current.seekToTime(citation.start_time);
            }
        } else {
            // Handle PDF page/bbox navigation
            addDebugLog('pdf_operation', {
                action: 'CITATION_CLICK_RECEIVED',
                citationId,
                citationPage: citation.page,
                hasPdfRef: !!pdfViewerRef.current
            });

            if (!pdfViewerRef.current) {
                addDebugLog('pdf_operation', {
                    action: 'PDF_REF_UNAVAILABLE',
                    citationId,
                    success: false
                });
                return;
            }

            // Clear existing highlights immediately
            pdfViewerRef.current.clearHighlights();
            setActiveHighlight(null);

            // Set new highlight state immediately for prop-based highlighting
            setActiveHighlight({ page: citation.page, bbox: citation.bbox });

            try {
                // Start navigation and highlighting in parallel for better responsiveness
                const navigationPromise = pdfViewerRef.current.goToPage(citation.page);

                // Apply highlight immediately without waiting for navigation
                setTimeout(() => {
                    if (pdfViewerRef.current) {
                        try {
                            pdfViewerRef.current.highlightArea(citation.page, citation.bbox);
                        } catch (error) {
                            addDebugLog('pdf_operation', {
                                action: 'HIGHLIGHT_FAILED',
                                citationId,
                                error: error.message,
                                success: false
                            });
                        }
                    }
                }, 20);

                // Wait for navigation to complete
                const navigationSuccess = await navigationPromise;

                // Apply additional highlight if navigation was successful
                if (navigationSuccess) {
                    setTimeout(() => {
                        if (pdfViewerRef.current) {
                            try {
                                pdfViewerRef.current.highlightArea(citation.page, citation.bbox);
                            } catch (error) {
                                addDebugLog('pdf_operation', {
                                    action: 'NAVIGATION_HIGHLIGHT_FAILED',
                                    citationId,
                                    error: error.message,
                                    success: false
                                });
                            }
                        }
                    }, 100);
                }
            } catch (error) {
                addDebugLog('pdf_operation', {
                    action: 'NAVIGATION_FAILED',
                    citationId,
                    error: error.message,
                    success: false
                });
                // Navigation failed, ensure highlighting still works
                setTimeout(() => {
                    if (pdfViewerRef.current) {
                        try {
                            pdfViewerRef.current.highlightArea(citation.page, citation.bbox);
                            addDebugLog('pdf_operation', {
                                action: 'FALLBACK_HIGHLIGHT_SUCCESS',
                                citationId,
                                page: citation.page
                            });
                        } catch (error) {
                            addDebugLog('pdf_operation', {
                                action: 'FALLBACK_HIGHLIGHT_FAILED',
                                citationId,
                                error: error.message,
                                success: false
                            });
                        }
                    }
                }, 50);
            }
        }
    }, [contentType]); // Include contentType in dependencies

    return (
        <main className="w-full h-screen flex flex-col">
            <header className="sticky top-0 z-40 w-full p-4 border-b dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 transition-colors"
                    >
                        <span className="-mt-1">←</span>
                        <span>Back</span>
                    </Link>
                    <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {contentTitle}
                    </div>
                </div>
                {isStreaming && (
                    <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>Generating summary...</span>
                    </div>
                )}
            </header>

            <ResizableLayout
                className="flex-1"
                leftPanel={
                    <div className="h-full bg-white dark:bg-neutral-900">
                        {contentType === 'youtube' ? (
                            contentUrl ? (
                                <div className="h-full flex flex-col">
                                    <div className="flex-none relative" style={{ height: '60%', minHeight: '300px' }}>
                                        <div className="absolute inset-4 top-6">
                                            <YouTubePlayer
                                                ref={youtubePlayerRef}
                                                videoId={docId}
                                                className="w-full h-full"
                                                onTimeUpdate={setCurrentVideoTime}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 p-4 overflow-y-auto">
                                        <TranscriptDisplay
                                            videoId={docId}
                                            currentTime={currentVideoTime}
                                            onSeekToTime={(time) => youtubePlayerRef.current?.seekToTime(time)}
                                            className=""
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-neutral-500">
                                    Loading YouTube video...
                                </div>
                            )
                        ) : (
                            <div className="h-full overflow-auto minimal-scrollbar">
                                {contentUrl ? (
                                    <EnhancedPdfViewer
                                        ref={pdfViewerRef}
                                        fileUrl={contentUrl}
                                        className="h-full"
                                        highlights={highlights}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-neutral-500">
                                        Loading PDF...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                }
                rightPanel={
                    <aside className="h-full overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-800/40 custom-scrollbar">
                        <div className="max-w-3xl mx-auto space-y-6">
                            <section>

                                {error && (
                                    <div className="p-4 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                        <p className="text-sm text-red-600 dark:text-red-400">
                                            Error: {error}
                                        </p>
                                    </div>
                                )}

                                {!summary && !isStreaming && !error && (
                                    <div className="text-center py-8">
                                        <button
                                            onClick={startStream}
                                            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 hover:scale-105 transition-all duration-200 cursor-pointer active:scale-95"
                                        >
                                            Generate Summary
                                        </button>
                                    </div>
                                )}

                                {(summary || isStreaming) && (
                                    <div className="prose prose-sm max-w-none">
                                        <CitationRenderer
                                            text={summary}
                                            citations={citations}
                                            onCitationClick={handleCitationClick}
                                            isStreaming={isStreaming}
                                        />
                                    </div>
                                )}
                            </section>
                        </div>
                    </aside>
                }
            />

            {/* Debug Components - Hidden but preserved */}
            {false && (
                <>
                    <CitationDebug
                        citations={citations}
                        isStreaming={isStreaming}
                        summary={summary}
                    />
                    <ChunksViewer
                        citations={citations}
                        summary={summary}
                        docId={docId}
                    />
                </>
            )}
        </main>
    );
} 