"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import EnhancedPdfViewer, { PdfViewerHandle } from "../components/enhanced-pdf-viewer";
import CitationRenderer from "../components/citation-renderer";
import { useSummaryStream, Citation } from "../../hooks/useSummaryStream";

export default function PdfPage() {
    const searchParams = useSearchParams();
    const docId = searchParams.get('src') || 'pdf_1';
    const [pdfUrl, setPdfUrl] = useState<string>("");
    const [pdfTitle, setPdfTitle] = useState<string>("Loading...");
    const [activeHighlight, setActiveHighlight] = useState<{ page: number; bbox: number[] } | null>(null);

    // Memoize highlights array to prevent unnecessary re-renders of PDF viewer
    const highlights = useMemo(() => {
        return activeHighlight ? [activeHighlight] : [];
    }, [activeHighlight]);

    // CitationRenderer is now memoized to prevent unnecessary re-renders

    const pdfViewerRef = useRef<PdfViewerHandle>(null);
    const { summary, citations, isStreaming, error, startStream } = useSummaryStream(docId);

    // Prevent PDF re-renders by not passing streaming state

    // Fetch PDF information
    useEffect(() => {
        const fetchPdfInfo = async () => {
            try {
                const response = await fetch(`http://localhost:8000/pdf/${docId}`);
                if (response.ok) {
                    const data = await response.json();
                    setPdfUrl(data.url);
                    setPdfTitle(data.title || "PDF Document");
                }
            } catch (err) {
                // Failed to fetch PDF info
            }
        };

        fetchPdfInfo();
    }, [docId]);

    // Auto-start streaming when component mounts
    useEffect(() => {
        if (pdfUrl) {
            startStream();
        }
    }, [pdfUrl]);

    const handleCitationClick = async (citationId: string, citation: Citation) => {
        // Navigate to the page using async method to handle virtualized pages
        if (pdfViewerRef.current) {
            // Clear existing highlights immediately
            pdfViewerRef.current.clearHighlights();
            setActiveHighlight(null);

            try {
                // Wait for navigation to complete (handles virtualized pages)
                const navigationSuccess = await pdfViewerRef.current.goToPage(citation.page);

                // Apply highlight with minimal delay regardless of navigation success
                setTimeout(() => {
                    if (pdfViewerRef.current) {
                        try {
                            // Only call highlightArea - setActiveHighlight will be handled by the prop
                            pdfViewerRef.current.highlightArea(citation.page, citation.bbox);
                            setActiveHighlight({ page: citation.page, bbox: citation.bbox });
                        } catch (error) {
                            // Highlighting failed, continue silently
                        }
                    }
                }, navigationSuccess ? 100 : 500); // Shorter delay if navigation was successful
            } catch (error) {
                // Navigation failed, try fallback highlighting
                setTimeout(() => {
                    if (pdfViewerRef.current) {
                        try {
                            pdfViewerRef.current.highlightArea(citation.page, citation.bbox);
                            setActiveHighlight({ page: citation.page, bbox: citation.bbox });
                        } catch (error) {
                            // Fallback highlighting also failed, continue silently
                        }
                    }
                }, 200);
            }
        }
    };

    return (
        <main className="w-full h-screen flex flex-col">
            <header className="w-full p-4 border-b dark:border-neutral-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 transition-colors"
                    >
                        <span className="-mt-1">←</span>
                        <span>Back</span>
                    </Link>
                    <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {pdfTitle}
                    </div>
                </div>
                {isStreaming && (
                    <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>Generating summary...</span>
                    </div>
                )}
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel - PDF Viewer */}
                <div className="w-1/2 h-full overflow-auto border-r dark:border-neutral-700 bg-white dark:bg-neutral-900">
                    {pdfUrl ? (
                        <EnhancedPdfViewer
                            ref={pdfViewerRef}
                            fileUrl={pdfUrl}
                            className="h-full"
                            highlights={highlights}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-neutral-500">
                            Loading PDF...
                        </div>
                    )}
                </div>

                {/* Right Panel - Streaming Summary */}
                <aside className="w-1/2 h-full overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-800/40">
                    <div className="max-w-3xl mx-auto space-y-6">
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold">AI Summary</h2>
                                {!isStreaming && summary && (
                                    <button
                                        onClick={startStream}
                                        className="text-sm px-3 py-1 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity"
                                    >
                                        Regenerate
                                    </button>
                                )}
                            </div>

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
                                        className="px-6 py-2 rounded-lg bg-primary text-white font-semibold hover:opacity-90 transition-opacity"
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
                                    />
                                    {isStreaming && (
                                        <span className="inline-block w-2 h-4 bg-neutral-400 animate-pulse ml-1"></span>
                                    )}
                                </div>
                            )}
                        </section>

                    </div>
                </aside>
            </div>
        </main>
    );
} 