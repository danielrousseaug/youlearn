"use client"
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  // Default value set to pdf_1 as per requirements
  const [url, setUrl] = useState("pdf_1");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      // TODO: Validate PDF URL format
      // TODO: Add loading state during navigation
      // TODO: Error handling for invalid URLs
      // TODO: Add recent URLs history
      router.push(`/render?src=${encodeURIComponent(url)}`);
    }
  };

  return (
    <main className="flex flex-col min-h-screen items-center justify-center p-6 gap-8 bg-white dark:bg-neutral-900">
      <h1 className="text-3xl font-bold text-center text-neutral-800 dark:text-neutral-100">
        PDF Summary Generator
      </h1>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl flex items-center gap-3 mt-4"
      >
        <input
          type="text"
          required
          placeholder="Enter PDF identifier or URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-grow px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          className="px-6 py-2 rounded-lg bg-primary cursor-pointer border text-white font-semibold hover:opacity-90"
        >
          Enter
        </button>
      </form>

      <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-8 space-y-2">
        <div>
          Access the PDF viewer directly at {" "}
          <a href="/render" className="underline hover:text-primary">
            /render
          </a>
        </div>
        <div>
          Debug chunks and bounding boxes at {" "}
          <a href="/debug?src=pdf_1" className="underline hover:text-primary">
            /debug
          </a>
        </div>
      </div>
    </main>
  );
}

