"use client";
import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { Citation } from '../../hooks/useSummaryStream';
import { addDebugLog, getDebugLogs } from './citation-debug';

interface CitationRendererProps {
  text: string;
  citations: Record<string, Citation>;
  onCitationClick?: (citationId: string, citation: Citation) => void;
}

function CitationRenderer({
  text,
  citations,
  onCitationClick
}: CitationRendererProps) {

  // Track component renders - add dependency array to prevent constant firing
  useEffect(() => {
    addDebugLog('render', {
      action: 'CITATION_RENDERER_RENDER',
      textLength: text.length,
      citationCount: Object.keys(citations).length,
      timestamp: Date.now()
    });
  }, [text.length, Object.keys(citations).length]); // Only log when actually changing

  // Simple ref to prevent rapid double-clicks - use Map for per-button tracking
  const buttonClickTracking = useRef<Map<string, number>>(new Map());

  // Use refs to access latest values without causing re-renders
  const citationsRef = useRef(citations);
  const onCitationClickRef = useRef(onCitationClick);

  // Update refs when values change
  useEffect(() => {
    citationsRef.current = citations;
    addDebugLog('citation_data', {
      citationCount: Object.keys(citations).length,
      citationKeys: Object.keys(citations),
      action: 'CITATIONS_UPDATED'
    });
  }, [citations]);

  useEffect(() => {
    onCitationClickRef.current = onCitationClick;
  }, [onCitationClick]);

  // Create citation button component with stable reference
  const createCitationButton = useCallback((numbers: string[], key: string) => {
    addDebugLog('render', {
      action: 'CITATION_BUTTON_CREATED',
      citationId: numbers[0],
      key,
      timestamp: Date.now()
    });
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const firstCitationId = numbers[0];
      const buttonKey = `${firstCitationId}-${key}`;

      // Per-button debouncing to prevent event storms
      const lastClick = buttonClickTracking.current.get(buttonKey) || 0;
      if (now - lastClick < 200) { // 200ms per-button debounce
        addDebugLog('citation_click', {
          type: 'CLICK_DEBOUNCED',
          citationId: firstCitationId,
          timeSinceLastClick: now - lastClick
        });
        return;
      }
      buttonClickTracking.current.set(buttonKey, now);

      const citation = citationsRef.current[firstCitationId];

      addDebugLog('citation_click', {
        citationId: firstCitationId,
        citation: citation ? 'HAS_DATA' : 'NO_DATA',
        hasHandler: !!onCitationClickRef.current,
        citationPage: citation?.page,
        citationBbox: citation?.bbox,
        success: !!(citation && onCitationClickRef.current)
      });

      if (citation && onCitationClickRef.current) {
        // Use setTimeout to ensure handler executes outside of React's event handling
        setTimeout(() => {
          if (onCitationClickRef.current && citation) {
            addDebugLog('citation_click', {
              citationId: firstCitationId,
              action: 'HANDLER_CALLED',
              success: true
            });
            onCitationClickRef.current(firstCitationId, citation);
          }
        }, 0);
      } else {
        addDebugLog('citation_click', {
          citationId: firstCitationId,
          action: 'HANDLER_FAILED',
          reason: !citation ? 'NO_CITATION_DATA' : 'NO_HANDLER',
          success: false
        });
      }
    };

    return (
      <button
        key={key}
        className="inline-flex items-center justify-center w-4 h-4 text-xs font-medium rounded-full cursor-pointer align-baseline text-neutral-600 bg-neutral-100 hover:bg-neutral-200 dark:text-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
        style={{
          position: 'relative',
          zIndex: 1000,
          pointerEvents: 'auto',
          border: '1px solid red' // Temporary visual debug aid
        }}
        onClick={handleClick}
        onMouseDown={(e) => {
          addDebugLog('citation_click', {
            type: 'RAW_MOUSE_DOWN',
            citationId: numbers[0],
            timestamp: Date.now(),
            hasReactHandler: !!handleClick
          });
        }}
        onPointerDown={(e) => {
          addDebugLog('citation_click', {
            type: 'RAW_POINTER_DOWN',
            citationId: numbers[0],
            timestamp: Date.now()
          });
        }}
        ref={(buttonElement) => {
          if (buttonElement) {
            // Add raw DOM listener to catch ALL clicks, even if React misses them
            const rawClickHandler = (e) => {
              addDebugLog('citation_click', {
                type: 'RAW_DOM_CLICK',
                citationId: numbers[0],
                timestamp: Date.now(),
                reactHandlerCalled: false
              });

              // If React's synthetic event system fails, trigger click directly
              const citation = citationsRef.current[numbers[0]];
              if (citation && onCitationClickRef.current) {
                // Small delay to let React handler fire first
                setTimeout(() => {
                  // Check if React handler was called by looking at recent logs
                  const recentLogs = getDebugLogs().slice(-5);
                  const reactHandlerCalled = recentLogs.some(log =>
                    log.type === 'citation_click' &&
                    log.data.action === 'HANDLER_CALLED' &&
                    Date.now() - log.timestamp < 100
                  );

                  if (!reactHandlerCalled) {
                    addDebugLog('citation_click', {
                      type: 'DOM_FALLBACK_TRIGGERED',
                      citationId: numbers[0],
                      timestamp: Date.now()
                    });
                    onCitationClickRef.current(numbers[0], citation);
                  }
                }, 10);
              }
            };

            buttonElement.addEventListener('click', rawClickHandler, { capture: true });

            // Cleanup function
            return () => {
              buttonElement.removeEventListener('click', rawClickHandler, { capture: true });
            };
          }
        }}
        title={numbers.map(num => {
          const citation = citationsRef.current[num];
          return citation ? `Page ${citation.page}: ${citation.text.substring(0, 100)}...` : '';
        }).filter(Boolean).join('\n')}
      >
        C
      </button>
    );
  }, []); // Stable callback using refs - no dependencies on changing values

  // Process LaTeX in text before it goes to React Markdown
  const processedText = useMemo(() => {
    if (!text) return '';

    let processedText = text;

    // Process LaTeX patterns and convert them to something React Markdown can handle better
    // Convert bracket LaTeX to inline math for better HTML structure
    processedText = processedText.replace(/\[([^\[\]]*(?:\\[^\[\]]*)*)\]/g, (match, content) => {
      // Check if this looks like LaTeX
      if (content.includes('\\') || /\b(?:text|frac|sqrt|sum|int|left|right)\b/.test(content)) {
        return `$${content}$`; // Convert to inline math
      }
      return match; // Keep as citation if not LaTeX
    });

    return processedText;
  }, [text]);

  // Function to process inline content with citations and inline LaTeX
  const processInlineContent = useCallback((children: React.ReactNode): React.ReactNode => {
    if (typeof children === 'string') {
      // Process both citations and inline LaTeX ($...$)
      const parts = [];
      let lastIndex = 0;

      // Create a combined pattern for both citations and inline math
      const combinedPattern = /(\[(\d+(?:,\s*\d+)*)\])|(\$(.+?)\$)/g;
      let match;

      while ((match = combinedPattern.exec(children)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(children.slice(lastIndex, match.index));
        }

        if (match[1]) {
          // It's a citation [1,2,3]
          const citationNumbers = match[2].split(',').map((n: string) => n.trim());
          const citationKey = `citation-${match.index}-${citationNumbers.join('-')}`;

          // Only render citation button if citation data is available
          const firstCitationId = citationNumbers[0];
          const hasCitationData = citationsRef.current[firstCitationId];

          if (hasCitationData) {
            parts.push(createCitationButton(citationNumbers, citationKey));
          } else {
            // Render as plain text until citation data arrives
            parts.push(match[1]);
            console.log('[CitationRenderer] Citation data not yet available for:', firstCitationId);
          }
        } else if (match[3]) {
          // It's inline LaTeX $...$
          try {
            parts.push(<InlineMath key={`math-${match.index}`} math={match[4]} />);
          } catch (error) {
            parts.push(match[3]); // Fallback to original text
          }
        }

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < children.length) {
        parts.push(children.slice(lastIndex));
      }

      return parts.length > 1 ? parts : children;
    }

    if (React.isValidElement(children)) {
      return children;
    }

    if (Array.isArray(children)) {
      return children.map((child, index) =>
        typeof child === 'string'
          ? processInlineContent(child)
          : child
      );
    }

    return children;
  }, [createCitationButton]);

  // Function to process LaTeX markers in text
  const processLatexInText = useCallback((text: string, latexMarkers: Record<string, { type: 'inline' | 'block', content: string }>) => {
    if (!text || !latexMarkers || Object.keys(latexMarkers).length === 0) {
      return text;
    }

    const parts = [];
    let lastIndex = 0;
    const markerPattern = /__LATEX_(INLINE|BLOCK)_(\d+)__/g;
    let match;

    while ((match = markerPattern.exec(text)) !== null) {
      // Add text before LaTeX
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Add LaTeX component
      const marker = match[0];
      const latexData = latexMarkers[marker];
      if (latexData) {
        try {
          if (latexData.type === 'inline') {
            parts.push(<InlineMath key={marker} math={latexData.content} />);
          } else {
            parts.push(<BlockMath key={marker} math={latexData.content} />);
          }
        } catch (error) {
          // Fallback to original LaTeX notation if rendering fails
          parts.push(latexData.type === 'inline' ? `$${latexData.content}$` : `$$${latexData.content}$$`);
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }, []);

  // No cleanup needed for simple timestamp-based debounce

  return (
    <div className="prose prose-sm max-w-none">
      <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        <ReactMarkdown
          components={{
            p: ({ children, ...props }) => (
              <p className="mb-4" {...props}>
                {processInlineContent(children)}
              </p>
            ),
            h1: ({ children, ...props }) => (
              <h1 className="text-2xl font-bold mb-4 text-neutral-800 dark:text-neutral-100" {...props}>
                {processInlineContent(children)}
              </h1>
            ),
            h2: ({ children, ...props }) => (
              <h2 className="text-xl font-semibold mb-3 text-neutral-800 dark:text-neutral-100" {...props}>
                {processInlineContent(children)}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3 className="text-lg font-semibold mb-2 text-neutral-800 dark:text-neutral-100" {...props}>
                {processInlineContent(children)}
              </h3>
            ),
            ul: ({ children, ...props }) => (
              <ul className="list-disc list-outside mb-4 space-y-1 pl-6" {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol className="list-decimal list-outside mb-4 space-y-1 pl-6" {...props}>
                {children}
              </ol>
            ),
            li: ({ children, ...props }) => (
              <li {...props}>
                {processInlineContent(children)}
              </li>
            ),
            strong: ({ children, ...props }) => (
              <strong className="font-semibold text-neutral-800 dark:text-neutral-200" {...props}>
                {processInlineContent(children)}
              </strong>
            ),
            em: ({ children, ...props }) => (
              <em className="italic" {...props}>
                {processInlineContent(children)}
              </em>
            ),
            blockquote: ({ children, ...props }) => (
              <blockquote className="border-l-4 border-neutral-300 dark:border-neutral-600 pl-4 my-4 italic text-neutral-600 dark:text-neutral-400" {...props}>
                {processInlineContent(children)}
              </blockquote>
            ),
            code: ({ children, ...props }) => (
              <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs font-mono" {...props}>
                {processInlineContent(children)}
              </code>
            ),
            pre: ({ children, ...props }) => (
              <pre className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-x-auto mb-4" {...props}>
                {children}
              </pre>
            ),
          }}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders during streaming
const MemoizedCitationRenderer = React.memo(CitationRenderer, (prevProps, nextProps) => {
  // Only re-render if text changes significantly (not just minor additions)
  const textChanged = prevProps.text !== nextProps.text;
  const textLengthDiff = Math.abs(prevProps.text.length - nextProps.text.length);
  const significantTextChange = textChanged && textLengthDiff > 50; // Only major text changes

  // Check if citation count changed (new citations appeared)
  const citationCountChanged = Object.keys(prevProps.citations).length !== Object.keys(nextProps.citations).length;

  // IGNORE handler changes during streaming to prevent citation button recreation
  // The component uses refs internally to access the latest handler, so this is safe

  // Only re-render for significant changes, not every character during streaming
  const shouldUpdate = significantTextChange || citationCountChanged;

  addDebugLog('render', {
    action: 'MEMOIZATION_CHECK',
    textChanged,
    textLengthDiff,
    significantTextChange,
    citationCountChanged,
    shouldUpdate,
    prevTextLength: prevProps.text.length,
    nextTextLength: nextProps.text.length
  });

  // Return true to SKIP re-render, false to allow re-render
  return !shouldUpdate;
});

MemoizedCitationRenderer.displayName = 'MemoizedCitationRenderer';

export default MemoizedCitationRenderer;