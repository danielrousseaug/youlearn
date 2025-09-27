"use client";
import React, { useState, useEffect } from 'react';
import { Citation } from '../../hooks/useSummaryStream';

interface ChunksViewerProps {
  citations: Record<string, Citation>;
  summary: string;
  docId?: string;
}

interface RawChunk {
  index: number;
  page: number;
  bbox: number[];
  text: string;
  preview: string;
}

export default function ChunksViewer({ citations, summary, docId = 'pdf_1' }: ChunksViewerProps) {
  const [showChunks, setShowChunks] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<string | null>(null);
  const [rawChunks, setRawChunks] = useState<RawChunk[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch raw chunks when component opens
  useEffect(() => {
    if (showChunks && rawChunks.length === 0) {
      setLoading(true);
      fetch(`http://localhost:8000/chunks/${docId}`)
        .then(res => res.json())
        .then(data => {
          setRawChunks(data.chunks || []);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch chunks:', err);
          setLoading(false);
        });
    }
  }, [showChunks, docId, rawChunks.length]);

  if (!showChunks) {
    return (
      <button
        onClick={() => setShowChunks(true)}
        className="fixed bottom-20 right-4 bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-mono z-50"
      >
        CHUNKS
      </button>
    );
  }

  // Extract all citations mentioned in the summary
  const citationsInSummary = summary.match(/\[\d+(?:,\s*\d+)*\]/g) || [];
  const uniqueCitationIds = [...new Set(
    citationsInSummary.flatMap(citation =>
      citation.replace(/[\[\]]/g, '').split(',').map(id => id.trim())
    )
  )].sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <div className="fixed bottom-4 right-80 bg-black text-green-400 p-4 rounded-lg text-xs font-mono z-50 max-w-2xl max-h-96 overflow-hidden flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-bold">CHUNKS VIEWER</h3>
        <button
          onClick={() => setShowChunks(false)}
          className="text-red-400 hover:text-red-300"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Citation List */}
        <div className="w-1/3 pr-2 border-r border-gray-700">
          <div className="text-yellow-400 mb-2">CITATIONS ({uniqueCitationIds.length}):</div>
          <div className="overflow-y-auto max-h-80">
            {uniqueCitationIds.map(citationId => {
              const citation = citations[citationId];
              const hasData = !!citation;
              return (
                <div
                  key={citationId}
                  className={`cursor-pointer p-1 rounded mb-1 ${
                    selectedCitation === citationId ? 'bg-blue-900' : 'hover:bg-gray-800'
                  } ${hasData ? 'text-green-400' : 'text-red-400'}`}
                  onClick={() => setSelectedCitation(citationId)}
                >
                  <div className="flex justify-between">
                    <span>[{citationId}]</span>
                    <span className="text-xs">
                      {hasData ? `P${citation.page}` : 'NO DATA'}
                    </span>
                  </div>
                  {hasData && (
                    <div className="text-gray-400 text-xs truncate">
                      {citation.text.substring(0, 30)}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Citation Details */}
        <div className="w-2/3 pl-2">
          {selectedCitation ? (
            <div>
              <div className="text-yellow-400 mb-2">
                CITATION [{selectedCitation}] DETAILS:
              </div>
              {citations[selectedCitation] ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-cyan-400">Page:</span> {citations[selectedCitation].page}
                  </div>
                  <div>
                    <span className="text-cyan-400">Bbox:</span>
                    <div className="text-xs text-gray-400">
                      [{citations[selectedCitation]?.bbox?.map(n => n.toFixed(1)).join(', ') || 'N/A'}]
                    </div>
                  </div>
                  <div>
                    <span className="text-cyan-400">Preview Text:</span>
                    <div className="text-gray-300 text-xs mt-1 p-2 bg-gray-900 rounded max-h-32 overflow-y-auto">
                      {citations[selectedCitation].text}
                    </div>
                  </div>
                  <div>
                    <span className="text-cyan-400">Raw Chunk (what model sees):</span>
                    <div className="text-gray-300 text-xs mt-1 p-2 bg-gray-900 rounded max-h-32 overflow-y-auto">
                      {(() => {
                        const chunkIndex = parseInt(selectedCitation);
                        const rawChunk = rawChunks.find(chunk => chunk.index === chunkIndex);
                        return rawChunk ? rawChunk.text : 'Loading raw chunk...';
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-cyan-400">Citation vs Raw Match:</span>
                    <div className="text-xs mt-1">
                      {(() => {
                        const chunkIndex = parseInt(selectedCitation);
                        const rawChunk = rawChunks.find(chunk => chunk.index === chunkIndex);
                        const citation = citations[selectedCitation];
                        if (rawChunk && citation) {
                          const match = rawChunk.text.includes(citation.text) || citation.text.includes(rawChunk.text.substring(0, 100));
                          return (
                            <span className={match ? 'text-green-400' : 'text-red-400'}>
                              {match ? '✓ MATCH' : '✗ MISMATCH'}
                            </span>
                          );
                        }
                        return <span className="text-yellow-400">Checking...</span>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-cyan-400">Usage in Summary:</span>
                    <div className="text-gray-300 text-xs mt-1 p-2 bg-gray-900 rounded max-h-24 overflow-y-auto">
                      {/* Find sentences in summary that contain this citation */}
                      {summary.split(/[.!?]+/).filter(sentence =>
                        sentence.includes(`[${selectedCitation}]`) ||
                        sentence.includes(`[${selectedCitation},`) ||
                        sentence.includes(`,${selectedCitation}]`) ||
                        sentence.includes(`,${selectedCitation},`)
                      ).map((sentence, idx) => (
                        <div key={idx} className="mb-1">
                          {sentence.trim()}.
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-red-400">
                  No data available for citation [{selectedCitation}]
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400">
              Select a citation from the list to view details
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-2 pt-2 border-t border-gray-700 text-xs">
        <div className="flex justify-between">
          <span>Citations in text: {uniqueCitationIds.length}</span>
          <span>Available data: {Object.keys(citations).length}</span>
          <span>Missing data: {uniqueCitationIds.filter(id => !citations[id]).length}</span>
        </div>
      </div>
    </div>
  );
}