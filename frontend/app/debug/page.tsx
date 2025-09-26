"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import EnhancedPdfViewer, { PdfViewerHandle } from "../components/enhanced-pdf-viewer";

interface ChunkData {
    chunk_id: number;
    page: number;
    text: string;
    text_preview: string;
    bbox: number[];
    bbox_info: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        width: number;
        height: number;
    };
}

interface DebugData {
    doc_id: string;
    pdf_info: {
        id: string;
        title: string;
        url: string;
    };
    total_chunks: number;
    chunks: ChunkData[];
    pages_with_chunks: number[];
}

export default function DebugPage() {
    const searchParams = useSearchParams();
    const docId = searchParams.get('src') || 'pdf_1';
    const [debugData, setDebugData] = useState<DebugData | null>(null);
    const [selectedChunk, setSelectedChunk] = useState<ChunkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const pdfViewerRef = useRef<PdfViewerHandle>(null);

    useEffect(() => {
        const fetchDebugData = async () => {
            try {
                setLoading(true);
                const response = await fetch(`http://localhost:8000/debug/chunks/${docId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.error) {
                        setError(data.error);
                    } else {
                        setDebugData(data);
                    }
                } else {
                    setError(`HTTP error! status: ${response.status}`);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchDebugData();
    }, [docId]);

    const handleChunkClick = (chunk: ChunkData) => {
        console.log('Chunk clicked:', chunk);
        setSelectedChunk(chunk);

        if (pdfViewerRef.current) {
            console.log(`Navigating to page ${chunk.page} with bbox:`, chunk.bbox);
            pdfViewerRef.current.goToPage(chunk.page);

            setTimeout(() => {
                if (pdfViewerRef.current) {
                    pdfViewerRef.current.clearHighlights();
                    pdfViewerRef.current.highlightArea(chunk.page, chunk.bbox);
                }
            }, 300);
        }
    };

    const groupChunksByPage = (chunks: ChunkData[]) => {
        const grouped: Record<number, ChunkData[]> = {};
        chunks.forEach(chunk => {
            if (!grouped[chunk.page]) {
                grouped[chunk.page] = [];
            }
            grouped[chunk.page].push(chunk);
        });
        return grouped;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading debug data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-red-600">Error: {error}</div>
            </div>
        );
    }

    if (!debugData) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-gray-600">No debug data available</div>
            </div>
        );
    }

    const groupedChunks = groupChunksByPage(debugData.chunks);

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
                        Debug: {debugData.pdf_info.title} ({debugData.total_chunks} chunks)
                    </div>
                </div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    Pages: {debugData.pages_with_chunks.join(', ')}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel - PDF Viewer */}
                <div className="w-1/2 h-full overflow-auto border-r dark:border-neutral-700 bg-white dark:bg-neutral-900">
                    <EnhancedPdfViewer
                        ref={pdfViewerRef}
                        fileUrl={debugData.pdf_info.url}
                        className="h-full"
                    />
                </div>

                {/* Right Panel - Chunk List */}
                <aside className="w-1/2 h-full overflow-y-auto p-4 bg-neutral-50 dark:bg-neutral-800/40">
                    <div className="space-y-4">
                        <div className="text-lg font-semibold mb-4">
                            Chunks Debug View
                        </div>

                        {selectedChunk && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                                    Selected Chunk #{selectedChunk.chunk_id}
                                </h3>
                                <div className="text-sm space-y-1">
                                    <div><strong>Page:</strong> {selectedChunk.page}</div>
                                    <div><strong>BBox:</strong> [{selectedChunk.bbox.map(n => n.toFixed(1)).join(', ')}]</div>
                                    <div><strong>Size:</strong> {selectedChunk.bbox_info.width.toFixed(1)} × {selectedChunk.bbox_info.height.toFixed(1)}</div>
                                    <div><strong>Text:</strong> {selectedChunk.text_preview}</div>
                                </div>
                            </div>
                        )}

                        {Object.entries(groupedChunks)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([page, chunks]) => (
                                <div key={page} className="border rounded-lg p-3 bg-white dark:bg-neutral-800">
                                    <h3 className="font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
                                        Page {page} ({chunks.length} chunks)
                                    </h3>
                                    <div className="space-y-2">
                                        {chunks.map((chunk) => (
                                            <button
                                                key={chunk.chunk_id}
                                                onClick={() => handleChunkClick(chunk)}
                                                className={`w-full text-left p-2 rounded text-sm border transition-colors ${
                                                    selectedChunk?.chunk_id === chunk.chunk_id
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
                                                        : 'bg-neutral-50 dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <span className="font-mono text-xs bg-neutral-200 dark:bg-neutral-600 px-1 rounded">
                                                        #{chunk.chunk_id}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                                                            BBox: [{chunk.bbox.map(n => n.toFixed(0)).join(', ')}]
                                                        </div>
                                                        <div className="truncate text-neutral-700 dark:text-neutral-300">
                                                            {chunk.text_preview}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                </aside>
            </div>
        </main>
    );
}