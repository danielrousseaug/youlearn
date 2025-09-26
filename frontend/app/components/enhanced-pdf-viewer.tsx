"use client";
import { GlobalWorkerOptions } from "pdfjs-dist";
import {
    Root,
    Pages,
    Page,
    CanvasLayer,
    TextLayer,
    AnnotationLayer,
} from "@anaralabs/lector";
import "pdfjs-dist/web/pdf_viewer.css";
import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from "react";
import { addDebugLog } from './citation-debug';

GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
).toString();

interface Highlight {
    page: number;
    bbox: number[];
    color?: string;
}

interface EnhancedPdfViewerProps {
    fileUrl: string;
    className?: string;
    highlights?: Highlight[];
}

export interface PdfViewerHandle {
    goToPage: (page: number) => Promise<boolean>;
    highlightArea: (page: number, bbox: number[]) => void;
    clearHighlights: () => void;
}

const EnhancedPdfViewer = forwardRef<PdfViewerHandle, EnhancedPdfViewerProps>(
    ({ fileUrl, className, highlights = [] }, ref) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const [activeHighlights, setActiveHighlights] = useState<Array<{
            id: string;
            page: number;
            bbox: number[];
            color: string;
        }>>([]);
        const [isHighlighting, setIsHighlighting] = useState(false);
        const lastHighlightOperationRef = useRef<number>(0);

        useImperativeHandle(ref, () => ({
            goToPage: (page: number) => {
                // Simplified page navigation since virtualization is disabled
                const attemptScrollToPage = (attempt: number = 0) => {
                    const maxAttempts = 5;

                    const container = containerRef.current;
                    if (!container) {
                        return Promise.resolve(false);
                    }

                    let pageElement = null;

                    // Try multiple page selector patterns within container
                    const pageSelectors = [
                        `[data-page-number="${page}"]`,
                        `[data-page="${page}"]`,
                        `.page:nth-child(${page})`,
                        `.page:nth-of-type(${page})`,
                        `[data-page-index="${page - 1}"]`,
                        `.lector-page[data-page="${page}"]`
                    ];

                    for (const selector of pageSelectors) {
                        pageElement = container.querySelector(selector);
                        if (pageElement) break;
                    }

                    // Find all page-like elements and select by index
                    if (!pageElement) {
                        const allPageSelectors = [
                            '.page',
                            '[class*="page"]',
                            '[data-page]',
                            '[data-page-number]',
                            '.lector-page',
                            'canvas[data-page]'
                        ];

                        for (const selector of allPageSelectors) {
                            const allPages = container.querySelectorAll(selector);
                            if (allPages.length >= page) {
                                pageElement = allPages[page - 1];
                                break;
                            }
                        }
                    }

                    if (pageElement) {
                        // Found the page - navigate to it
                        const currentScrollTop = container.scrollTop;
                        const elementTop = pageElement.offsetTop;
                        const scrollDistance = Math.abs(elementTop - currentScrollTop);
                        const useInstantScroll = scrollDistance > 1500;

                        try {
                            pageElement.scrollIntoView({
                                behavior: useInstantScroll ? 'instant' : 'smooth',
                                block: 'start',
                                inline: 'nearest'
                            });

                            return Promise.resolve(true);
                        } catch (scrollError) {
                            container.scrollTo({
                                top: pageElement.offsetTop,
                                behavior: useInstantScroll ? 'instant' : 'smooth'
                            });
                            return Promise.resolve(true);
                        }
                    } else if (attempt < maxAttempts) {
                        // Retry with increasing delay - pages might still be loading
                        const delay = 200 * (attempt + 1);
                        setTimeout(() => attemptScrollToPage(attempt + 1), delay);
                        return Promise.resolve(false);
                    } else {
                        return Promise.resolve(false);
                    }
                };

                // Return promise for async handling
                return new Promise((resolve) => {
                    const handleResult = async () => {
                        const result = await attemptScrollToPage();
                        resolve(result);
                    };

                    setTimeout(handleResult, 100);
                });
            },
            highlightArea: (page: number, bbox: number[]) => {
                const now = Date.now();

                // Rate limit highlight operations instead of blocking
                if (now - lastHighlightOperationRef.current < 100) {
                    console.log('[PDF Viewer] Rate limiting highlight operation');
                    return;
                }
                lastHighlightOperationRef.current = now;

                const highlightId = `highlight-${page}-${now}`;

                // Remove noisy PDF highlight logging

                // Clear existing highlights immediately
                setActiveHighlights([]);

                // Add new highlight
                const newHighlight = {
                    id: highlightId,
                    page,
                    bbox,
                    color: '#22c55e'
                };

                setActiveHighlights([newHighlight]);

                // Apply highlight to DOM with reduced delay
                setTimeout(() => {
                    applyHighlightToDOM(newHighlight);
                }, 10); // Reduced from 50ms to 10ms
            },
            clearHighlights: () => {
                setActiveHighlights([]);
                // Remove all highlight elements from DOM
                const existingHighlights = document.querySelectorAll('.pdf-highlight');
                existingHighlights.forEach(el => el.remove());
            }
        }));

        const applyHighlightToDOM = (highlight: { id: string; page: number; bbox: number[]; color: string }) => {
            // Try to find the PDF page container
            const pdfContainer = containerRef.current;
            if (!pdfContainer) return;

            // Look for page elements - Lector uses various selectors
            const pageSelectors = [
                `[data-page-number="${highlight.page}"]`,
                `.page:nth-child(${highlight.page})`,
                `.page[data-page="${highlight.page}"]`,
                `.page:nth-of-type(${highlight.page})`
            ];

            let pageElement = null;
            for (const selector of pageSelectors) {
                pageElement = pdfContainer.querySelector(selector);
                if (pageElement) break;
            }

            // Fallback: get all page elements and select by index
            if (!pageElement) {
                const allPages = pdfContainer.querySelectorAll('.page, [class*="page"]');
                pageElement = allPages[highlight.page - 1];
            }

            if (pageElement) {
                // Create highlight element
                const highlightEl = document.createElement('div');
                highlightEl.className = 'pdf-highlight';
                highlightEl.id = highlight.id;

                // Force immediate visibility to prevent any fade-in animations
                highlightEl.style.opacity = '0.15';
                highlightEl.style.visibility = 'visible';
                highlightEl.style.display = 'block';

                // Get page dimensions for scaling
                const pageRect = pageElement.getBoundingClientRect();

                // Try to find the actual PDF page dimensions in PDF coordinate space
                // For the "Attention is All You Need" paper, based on the bbox data, it appears to be:
                // - Width: around 612 points (standard letter width)
                // - Height: around 792 points (standard letter height)
                // But let's try to detect this dynamically by looking at the max coordinates

                let pdfPageWidth = 612; // Default US Letter width
                let pdfPageHeight = 792; // Default US Letter height

                // Try method 1: Look for canvas and check its internal dimensions
                const canvas = pageElement.querySelector('canvas');
                if (canvas) {
                    // Check if the canvas has width/height attributes that might represent PDF coordinates
                    const canvasWidth = canvas.width || canvas.getAttribute('width');
                    const canvasHeight = canvas.height || canvas.getAttribute('height');
                    if (canvasWidth && canvasHeight) {
                        pdfPageWidth = parseFloat(canvasWidth);
                        pdfPageHeight = parseFloat(canvasHeight);
                    }
                }

                // Method 2: Use the displayed page dimensions directly
                // Since Lector might already be scaling, let's try using a 1:1 ratio first
                if (!canvas || pdfPageWidth === 612) {
                    // Fallback: assume the displayed page size matches PDF coordinate space
                    pdfPageWidth = pageRect.width;
                    pdfPageHeight = pageRect.height;
                }

                // Calculate scale based on actual displayed size vs PDF coordinate space
                const scaleX = pageRect.width / pdfPageWidth;
                const scaleY = pageRect.height / pdfPageHeight;

                // Apply bbox coordinates with scaling (using direct coordinate mapping)
                const [x1, y1, x2, y2] = highlight.bbox;
                const scaledX = x1 * scaleX;
                const scaledY = y1 * scaleY;
                const scaledWidth = (x2 - x1) * scaleX;
                const scaledHeight = (y2 - y1) * scaleY;

                highlightEl.style.cssText = `
                    position: absolute;
                    left: ${scaledX}px;
                    top: ${scaledY}px;
                    width: ${scaledWidth}px;
                    height: ${scaledHeight}px;
                    background-color: #22c55e;
                    opacity: 0.15;
                    pointer-events: none;
                    z-index: 10;
                    border: 1px solid #22c55e;
                    border-radius: 2px;
                    transition: none !important;
                    animation: none !important;
                    transform: none !important;
                    transition-property: none !important;
                    transition-duration: 0s !important;
                    animation-duration: 0s !important;
                    animation-delay: 0s !important;
                    transition-delay: 0s !important;
                    will-change: auto !important;
                `;

                // Position relative to page
                pageElement.style.position = 'relative';

                // Force immediate display using requestAnimationFrame to ensure synchronous rendering
                requestAnimationFrame(() => {
                    pageElement.appendChild(highlightEl);
                    // Force reflow to ensure immediate visibility
                    highlightEl.offsetHeight;
                });
            }
        };

        // Apply highlights when they change - with throttling to prevent stuttering during streaming
        useEffect(() => {
            // Clear existing highlights
            const existingHighlights = document.querySelectorAll('.pdf-highlight');
            existingHighlights.forEach(el => el.remove());

            // Apply new highlights with minimal delay to prevent fade-in effect
            if (activeHighlights.length > 0) {
                setTimeout(() => {
                    activeHighlights.forEach(highlight => {
                        applyHighlightToDOM(highlight);
                    });
                }, 100);
            }
        }, [activeHighlights, fileUrl]);

        // Handle prop-based highlights with reduced throttling
        const highlightUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        useEffect(() => {
            // Clear any pending highlight updates first
            if (highlightUpdateTimeoutRef.current) {
                clearTimeout(highlightUpdateTimeoutRef.current);
            }

            if (highlights.length > 0) {
                // Reduced throttle time for more responsive highlighting during streaming
                highlightUpdateTimeoutRef.current = setTimeout(() => {
                    const propHighlights = highlights.map((h, idx) => ({
                        id: `prop-highlight-${idx}`,
                        page: h.page,
                        bbox: h.bbox,
                        color: h.color || '#22c55e' // Use green color consistently
                    }));
                    setActiveHighlights(propHighlights);
                }, 50); // Reduced from 200ms to 50ms
            } else if (activeHighlights.length > 0) {
                // Only clear if there are existing highlights to prevent infinite loop
                setActiveHighlights([]);
            }

            // Cleanup function
            return () => {
                if (highlightUpdateTimeoutRef.current) {
                    clearTimeout(highlightUpdateTimeoutRef.current);
                }
            };
        }, [highlights, activeHighlights.length]); // Add activeHighlights.length to dependencies

        return (
            <div ref={containerRef} className={className ?? "w-full h-full relative"}>
                <Root
                    source={fileUrl}
                    className="w-full h-full"
                    loader={<p className="p-4">Loading PDF…</p>}
                    isZoomFitWidth
                >
                    <Pages virtualizerOptions={{ overscan: 1000 }}>
                        <Page>
                            <CanvasLayer />
                            <TextLayer />
                            <AnnotationLayer />
                        </Page>
                    </Pages>
                </Root>

                <style jsx global>{`
                    .pdf-highlight {
                        transition: none !important;
                        animation: none !important;
                        transform: none !important;
                        transition-property: none !important;
                        transition-duration: 0s !important;
                        animation-duration: 0s !important;
                        animation-delay: 0s !important;
                        transition-delay: 0s !important;
                        will-change: auto !important;
                        -webkit-transition: none !important;
                        -moz-transition: none !important;
                        -o-transition: none !important;
                        -webkit-animation: none !important;
                        -moz-animation: none !important;
                        -o-animation: none !important;
                    }
                    .pdf-highlight:hover {
                        opacity: 0.25 !important;
                        transition: none !important;
                        transition-property: none !important;
                        transition-duration: 0s !important;
                        -webkit-transition: none !important;
                        -moz-transition: none !important;
                        -o-transition: none !important;
                    }

                    /* Override any potential PDF.js CSS */
                    .pdf-highlight * {
                        transition: none !important;
                        animation: none !important;
                        -webkit-transition: none !important;
                        -moz-transition: none !important;
                        -o-transition: none !important;
                        -webkit-animation: none !important;
                        -moz-animation: none !important;
                        -o-animation: none !important;
                    }

                    /* Force immediate opacity changes globally */
                    .pdf-highlight,
                    .pdf-highlight:before,
                    .pdf-highlight:after {
                        transition: none !important;
                        animation: none !important;
                        -webkit-transition: none !important;
                        -moz-transition: none !important;
                        -o-transition: none !important;
                    }

                    /* Override any * selectors that might add transitions */
                    * .pdf-highlight {
                        transition: none !important;
                        animation: none !important;
                    }
                `}</style>
            </div>
        );
    }
);

EnhancedPdfViewer.displayName = 'EnhancedPdfViewer';

// Memoize the component to prevent unnecessary re-renders during streaming
const MemoizedEnhancedPdfViewer = React.memo(EnhancedPdfViewer, (prevProps, nextProps) => {
    // Only re-render if fileUrl, highlights, or currentPage change
    return (
        prevProps.fileUrl === nextProps.fileUrl &&
        prevProps.currentPage === nextProps.currentPage &&
        prevProps.className === nextProps.className &&
        JSON.stringify(prevProps.highlights) === JSON.stringify(nextProps.highlights)
    );
});

MemoizedEnhancedPdfViewer.displayName = 'MemoizedEnhancedPdfViewer';

export default MemoizedEnhancedPdfViewer;