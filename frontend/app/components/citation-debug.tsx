"use client";
import React, { useState, useEffect } from 'react';
import { Citation } from '../../hooks/useSummaryStream';

interface CitationDebugProps {
  citations: Record<string, Citation>;
  isStreaming: boolean;
  summary: string;
}

interface DebugLog {
  timestamp: number;
  type: 'citation_click' | 'citation_data' | 'pdf_operation' | 'render';
  data: any;
}

let debugLogs: DebugLog[] = [];

// Export debugLogs for other components to access
export const getDebugLogs = () => debugLogs;

// Global debug logger
export const addDebugLog = (type: DebugLog['type'], data: any) => {
  const log = {
    timestamp: Date.now(),
    type,
    data
  };
  debugLogs.push(log);

  // Keep only last 100 logs
  if (debugLogs.length > 100) {
    debugLogs = debugLogs.slice(-100);
  }

  console.log(`[DEBUG ${type.toUpperCase()}]`, data);
};

export default function CitationDebug({ citations, isStreaming, summary }: CitationDebugProps) {
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [citationStats, setCitationStats] = useState({
    totalClicks: 0,
    successfulClicks: 0,
    failedClicks: 0
  });

  // Update logs every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLogs([...debugLogs]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Track citation statistics - only count meaningful user click attempts
  useEffect(() => {
    // Only count actual citation click attempts, not raw DOM events
    const clickLogs = debugLogs.filter(log =>
      log.type === 'citation_click' &&
      log.data.hasOwnProperty('success') && // Only events that have success/failure
      !log.data.type // Exclude raw DOM/mouse events
    );
    const successLogs = clickLogs.filter(log => log.data.success === true);
    const failLogs = clickLogs.filter(log => log.data.success === false);

    setCitationStats({
      totalClicks: clickLogs.length,
      successfulClicks: successLogs.length,
      failedClicks: failLogs.length
    });
  }, [logs]);

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        className="fixed bottom-4 right-4 bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-mono z-50"
      >
        DEBUG
      </button>
    );
  }

  const recentLogs = logs.slice(-20);
  const citationKeys = Object.keys(citations);
  const summaryHasCitations = summary.match(/\[\d+\]/g) || [];
  const uniqueCitationsInText = [...new Set(summaryHasCitations.map(c => c.replace(/[\[\]]/g, '')))];

  return (
    <div className="fixed bottom-4 right-4 bg-black text-green-400 p-4 rounded-lg text-xs font-mono z-50 max-w-md max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-bold">CITATION DEBUG</h3>
        <button
          onClick={() => setShowDebug(false)}
          className="text-red-400 hover:text-red-300"
        >
          ✕
        </button>
      </div>

      {/* Statistics */}
      <div className="mb-3 p-2 bg-gray-900 rounded">
        <div className="text-yellow-400">CLICK STATS:</div>
        <div>Total: {citationStats.totalClicks}</div>
        <div className="text-green-400">Success: {citationStats.successfulClicks}</div>
        <div className="text-red-400">Failed: {citationStats.failedClicks}</div>
        <div>Success Rate: {citationStats.totalClicks > 0 ? Math.round((citationStats.successfulClicks / citationStats.totalClicks) * 100) : 0}%</div>
      </div>

      {/* Current State */}
      <div className="mb-3 p-2 bg-gray-900 rounded">
        <div className="text-yellow-400">CURRENT STATE:</div>
        <div>Streaming: {isStreaming ? 'YES' : 'NO'}</div>
        <div>Citations Available: {citationKeys.length}</div>
        <div>Citations in Text: {uniqueCitationsInText.length}</div>
        <div>Available Keys: {citationKeys.join(', ')}</div>
        <div>Text Keys: {uniqueCitationsInText.join(', ')}</div>
      </div>

      {/* Citation Status */}
      <div className="mb-3 p-2 bg-gray-900 rounded">
        <div className="text-yellow-400">CITATION STATUS:</div>
        {uniqueCitationsInText.map(citationId => {
          const hasData = citations[citationId];
          return (
            <div key={citationId} className={hasData ? 'text-green-400' : 'text-red-400'}>
              [{citationId}]: {hasData ? 'READY' : 'MISSING DATA'}
            </div>
          );
        })}
      </div>

      {/* Recent Logs */}
      <div className="mb-3">
        <div className="text-yellow-400 mb-1">RECENT EVENTS:</div>
        <div className="max-h-32 overflow-y-auto">
          {recentLogs.filter(log =>
            // Only show important events: clicks, failures, and fallbacks
            (log.type === 'citation_click' && (log.data.success !== undefined || log.data.type === 'REACT_FAILED_DOM_FALLBACK')) ||
            (log.type === 'pdf_operation' && log.data.success === false) ||
            (log.type === 'render' && log.data.action === 'RENDER_BLOCKED_DURING_STREAMING')
          ).map((log, idx) => (
            <div key={idx} className="text-xs">
              <span className="text-gray-400">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={
                log.data.success === false ? 'text-red-400' :
                log.data.type === 'REACT_FAILED_DOM_FALLBACK' ? 'text-yellow-400' :
                log.data.success === true ? 'text-green-400' :
                'text-white'
              }>
                {' '}
                {log.data.type === 'REACT_FAILED_DOM_FALLBACK' ? 'FALLBACK' :
                 log.data.success === false ? 'FAIL' :
                 log.data.success === true ? 'SUCCESS' :
                 log.data.action || log.type.toUpperCase()}
              </span>
              <div className="text-gray-300 pl-2">
                [{log.data.citationId || 'N/A'}] {log.data.reason || log.data.error || ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          debugLogs = [];
          setLogs([]);
          setCitationStats({ totalClicks: 0, successfulClicks: 0, failedClicks: 0 });
        }}
        className="bg-red-600 text-white px-2 py-1 rounded text-xs"
      >
        CLEAR LOGS
      </button>
    </div>
  );
}