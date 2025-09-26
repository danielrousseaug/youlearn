"use client";
import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { Citation } from '../../hooks/useSummaryStream';

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

  // Simple ref to prevent rapid double-clicks
  const lastClickRef = useRef<number>(0);

  // Use refs to access latest values without causing re-renders
  const citationsRef = useRef(citations);
  const onCitationClickRef = useRef(onCitationClick);

  // Update refs when values change
  useEffect(() => {
    citationsRef.current = citations;
  }, [citations]);

  useEffect(() => {
    onCitationClickRef.current = onCitationClick;
  }, [onCitationClick]);

  // Create citation button component with stable reference
  const createCitationButton = useCallback((numbers: string[], key: string) => {
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Simple debounce using timestamp
      const now = Date.now();
      if (now - lastClickRef.current < 100) {
        return;
      }
      lastClickRef.current = now;

      const firstCitationId = numbers[0];
      const citation = citationsRef.current[firstCitationId];

      if (citation && onCitationClickRef.current) {
        onCitationClickRef.current(firstCitationId, citation);
      }
    };

    return (
      <button
        key={key}
        className="inline-flex items-center justify-center w-4 h-4 text-xs font-medium rounded-full cursor-pointer align-baseline text-neutral-600 bg-neutral-100 hover:bg-neutral-200 dark:text-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
        onClick={handleClick}
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
          parts.push(createCitationButton(citationNumbers, citationKey));
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
  // Only re-render if text actually changes in a meaningful way
  // This prevents re-renders when citations object changes but text is the same
  const textChanged = prevProps.text !== nextProps.text;
  const citationCountChanged = Object.keys(prevProps.citations).length !== Object.keys(nextProps.citations).length;

  // IGNORE handler changes during streaming to prevent citation button recreation
  // The component uses refs internally to access the latest handler, so this is safe
  const shouldUpdate = textChanged || citationCountChanged;


  // Return true to SKIP re-render, false to allow re-render
  return !shouldUpdate;
});

MemoizedCitationRenderer.displayName = 'MemoizedCitationRenderer';

export default MemoizedCitationRenderer;