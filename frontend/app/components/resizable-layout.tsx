"use client";
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  minPanelWidth?: number;
  className?: string;
}

export default function ResizableLayout({
  leftPanel,
  rightPanel,
  minPanelWidth = 80,
  className = ""
}: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(50); // Percentage
  const [isDragging, setIsDragging] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastWidthRef = useRef(50);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    // Calculate minimum widths in percentage
    const minWidthPercent = (minPanelWidth / containerRect.width) * 100;
    const maxWidthPercent = 100 - minWidthPercent;

    // Clamp the width and check for collapse thresholds
    const clampedWidth = Math.max(minWidthPercent, Math.min(maxWidthPercent, newLeftWidth));

    // Auto-collapse thresholds
    if (newLeftWidth < 10) {
      setIsLeftCollapsed(true);
      setIsRightCollapsed(false);
      setLeftWidth(0);
    } else if (newLeftWidth > 90) {
      setIsRightCollapsed(true);
      setIsLeftCollapsed(false);
      setLeftWidth(100);
    } else {
      setIsLeftCollapsed(false);
      setIsRightCollapsed(false);
      setLeftWidth(clampedWidth);
      lastWidthRef.current = clampedWidth;
    }
  }, [isDragging, minPanelWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const toggleLeftPanel = useCallback(() => {
    if (isLeftCollapsed) {
      setIsLeftCollapsed(false);
      setIsRightCollapsed(false);
      setLeftWidth(lastWidthRef.current);
    } else {
      setIsLeftCollapsed(true);
      setLeftWidth(0);
    }
  }, [isLeftCollapsed]);

  const toggleRightPanel = useCallback(() => {
    if (isRightCollapsed) {
      setIsRightCollapsed(false);
      setIsLeftCollapsed(false);
      setLeftWidth(lastWidthRef.current);
    } else {
      setIsRightCollapsed(true);
      setLeftWidth(100);
    }
  }, [isRightCollapsed]);

  const resetLayout = useCallback(() => {
    setIsLeftCollapsed(false);
    setIsRightCollapsed(false);
    setLeftWidth(50);
    lastWidthRef.current = 50;
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full ${className}`}
    >
      {/* Left Panel */}
      <div
        className={`relative transition-all duration-300 ease-out ${
          isLeftCollapsed ? 'w-0' : ''
        }`}
        style={!isLeftCollapsed ? { width: `${leftWidth}%` } : {}}
      >
        <div className={`h-full overflow-hidden ${isLeftCollapsed ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
          {leftPanel}
        </div>
      </div>

      {/* Invisible Resizer Zone */}
      {!isLeftCollapsed && !isRightCollapsed && (
        <div
          className="absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-30 group"
          style={{ left: `${leftWidth}%` }}
          onMouseDown={handleMouseDown}
        >
          {/* Subtle Drag Indicator - Only visible on hover/drag */}
          <div className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-all duration-200 ${
            isDragging
              ? 'w-0.5 bg-neutral-400/50 dark:bg-neutral-500/50'
              : 'w-px bg-transparent group-hover:bg-neutral-300/50 dark:group-hover:bg-neutral-600/50'
          }`}>
          </div>
        </div>
      )}

      {/* Right Panel */}
      <div
        className={`relative transition-all duration-300 ease-out ${
          isRightCollapsed ? 'w-0' : ''
        }`}
        style={!isRightCollapsed ? { width: `${100 - leftWidth}%` } : {}}
      >
        <div className={`h-full overflow-hidden ${isRightCollapsed ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
          {rightPanel}
        </div>
      </div>

      {/* Collapse Toggle Buttons */}
      {isLeftCollapsed && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-50">
          <button
            onClick={toggleLeftPanel}
            className="group flex items-center justify-center w-8 h-16 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-r-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-white dark:hover:bg-neutral-800"
          >
            <div className="flex flex-col items-center text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-xs font-medium mt-1">PDF</span>
            </div>
          </button>
        </div>
      )}

      {isRightCollapsed && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-50">
          <button
            onClick={toggleRightPanel}
            className="group flex items-center justify-center w-8 h-16 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-l-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-white dark:hover:bg-neutral-800"
          >
            <div className="flex flex-col items-center text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-xs font-medium mt-1">AI</span>
            </div>
          </button>
        </div>
      )}

      {/* Reset Layout Button - appears when either panel is collapsed */}
      {(isLeftCollapsed || isRightCollapsed) && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={resetLayout}
            className="group flex items-center justify-center w-10 h-10 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-white dark:hover:bg-neutral-800"
            title="Reset layout"
          >
            <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-800 dark:group-hover:text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}