"use client"
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PresetPDF {
  id: string;
  name: string;
  description: string;
}

const presetPDFs: PresetPDF[] = [
  {
    id: "pdf_1",
    name: "Attention is All You Need",
    description: "Transformer architecture paper"
  },
  {
    id: "pdf_2",
    name: "The Chemical Basis of Life",
    description: "Chemistry textbook"
  },
  {
    id: "pdf_3",
    name: "Technik",
    description: "German bicycle magazine"
  }
];

export default function Home() {
  const [selectedOption, setSelectedOption] = useState<'preset' | 'upload' | 'youtube'>('preset');
  const [selectedPDF, setSelectedPDF] = useState(presetPDFs[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSubmit = async () => {
    if (selectedOption === 'preset' && selectedPDF) {
      router.push(`/render?src=${encodeURIComponent(selectedPDF)}`);
    } else if (selectedOption === 'upload' && uploadedFile) {
      try {
        setIsProcessing(true);
        // Upload the file to the backend
        const formData = new FormData();
        formData.append('file', uploadedFile);

        const response = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          router.push(`/render?src=${encodeURIComponent(data.file_id)}`);
        } else {
          console.error('Upload failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
      } finally {
        setIsProcessing(false);
      }
    } else if (selectedOption === 'youtube' && youtubeUrl.trim()) {
      try {
        setIsProcessing(true);
        // Process the YouTube URL
        const response = await fetch(`${API_BASE_URL}/upload-youtube`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: youtubeUrl.trim() }),
        });

        if (response.ok) {
          const data = await response.json();
          router.push(`/render?src=${encodeURIComponent(data.video_id)}`);
        } else {
          console.error('YouTube processing failed');
        }
      } catch (error) {
        console.error('YouTube processing error:', error);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setUploadedFile(file);
      setSelectedOption('upload');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setUploadedFile(file);
      setSelectedOption('upload');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const selectedPDFInfo = presetPDFs.find(pdf => pdf.id === selectedPDF);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-to-b from-white to-neutral-50 dark:from-neutral-900 dark:to-neutral-950">
      {/* Header */}
      <header className="w-full px-8 py-6 border-b border-neutral-200/50 dark:border-neutral-800/50">
        <div className="max-w-6xl mx-auto">
          <span className="text-lg font-semibold text-neutral-900 dark:text-white">YouLearn Demo</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-8">
          {/* Title Section */}
          <div className="text-center space-y-3">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-400 bg-clip-text text-transparent">
              PDF Summary Generator
            </h1>
            <p className="text-lg text-neutral-600 dark:text-neutral-400">
              Transform your documents into concise, intelligent summaries
            </p>
          </div>

          {/* Selection Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-6">
            {/* Option Tabs */}
            <div className="flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-1">
              <button
                onClick={() => setSelectedOption('preset')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  selectedOption === 'preset'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-md'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Sample Documents
              </button>
              <button
                onClick={() => setSelectedOption('upload')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  selectedOption === 'upload'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-md'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Upload PDF
              </button>
              <button
                onClick={() => setSelectedOption('youtube')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  selectedOption === 'youtube'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-md'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                YouTube Video
              </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[200px]">
              {selectedOption === 'preset' ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Select a sample document
                  </label>

                  {/* Custom Dropdown */}
                  <div className="dropdown-container relative">
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-left flex items-center justify-between hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {selectedPDFInfo?.name}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {selectedPDFInfo?.description}
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-neutral-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown Options */}
                    {isDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-lg z-50 overflow-hidden">
                        {presetPDFs.map((pdf) => (
                          <button
                            key={pdf.id}
                            onClick={() => {
                              setSelectedPDF(pdf.id);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors ${
                              pdf.id === selectedPDF ? 'bg-neutral-50 dark:bg-neutral-700' : ''
                            }`}
                          >
                            <div className="font-medium text-neutral-900 dark:text-white">
                              {pdf.name}
                            </div>
                            <div className="text-sm text-neutral-500 dark:text-neutral-400">
                              {pdf.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedOption === 'upload' ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Upload your PDF document
                  </label>

                  {/* File Upload Area */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? 'border-neutral-500 bg-neutral-50 dark:bg-neutral-800/50'
                        : uploadedFile
                        ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10'
                        : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      value=""
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {uploadedFile ? (
                      <div className="space-y-2">
                        <div className="w-12 h-12 mx-auto rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {uploadedFile.name}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFile(null);
                          }}
                          className="text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="w-12 h-12 mx-auto rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                          <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <div className="font-medium text-neutral-700 dark:text-neutral-300">
                            {isDragging ? 'Drop your PDF here' : 'Click to upload or drag and drop'}
                          </div>
                          <div className="text-sm text-neutral-500 dark:text-neutral-400">
                            PDF files up to 50MB
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Enter YouTube video URL
                  </label>

                  {/* YouTube URL Input */}
                  <div className="relative">
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400 focus:border-neutral-500 dark:focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 dark:focus:ring-neutral-700 transition-colors"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M17 21l-5-5-5 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
                      </svg>
                    </div>
                  </div>

                  {youtubeUrl && (
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                          </svg>
                        </div>
                        <div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            YouTube Video Ready
                          </div>
                          <div className="text-sm text-neutral-500 dark:text-neutral-400">
                            Click &quot;Generate Summary&quot; to process this video
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Button */}
            <button
              onClick={handleSubmit}
              disabled={
                isProcessing ||
                (selectedOption === 'upload' && !uploadedFile) ||
                (selectedOption === 'youtube' && !youtubeUrl.trim())
              }
              className={`w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                isProcessing ||
                (selectedOption === 'upload' && !uploadedFile) ||
                (selectedOption === 'youtube' && !youtubeUrl.trim())
                  ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                  : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 cursor-pointer'
              }`}
            >
              {isProcessing ? 'Processing...' : 'Generate Summary'}
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}