"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface YouTubePlayerHandle {
  seekToTime: (timeInSeconds: number) => void;
  getCurrentTime: () => number;
}

interface YouTubePlayerProps {
  videoId: string;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
}

// YouTube Player API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  ({ videoId, className, onTimeUpdate }, ref) => {
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<NodeJS.Timeout>();

    useImperativeHandle(ref, () => ({
      seekToTime: (timeInSeconds: number) => {
        if (playerRef.current && playerRef.current.seekTo) {
          playerRef.current.seekTo(timeInSeconds, true);
        }
      },
      getCurrentTime: () => {
        if (playerRef.current && playerRef.current.getCurrentTime) {
          return playerRef.current.getCurrentTime();
        }
        return 0;
      }
    }));

    useEffect(() => {
      // Load YouTube IFrame API
      const loadYouTubeAPI = () => {
        if (window.YT && window.YT.Player) {
          initializePlayer();
          return;
        }

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          const script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          script.async = true;
          document.head.appendChild(script);
        }

        window.onYouTubeIframeAPIReady = initializePlayer;
      };

      const initializePlayer = () => {
        if (!containerRef.current || !videoId) return;

        // Clear container
        containerRef.current.innerHTML = '';

        playerRef.current = new window.YT.Player(containerRef.current, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            showinfo: 0,
            modestbranding: 1,
            fs: 1,
            cc_load_policy: 1,
            iv_load_policy: 3,
            autohide: 1
          },
          events: {
            onReady: (event: any) => {
              // Start time tracking
              if (onTimeUpdate) {
                intervalRef.current = setInterval(() => {
                  if (playerRef.current?.getCurrentTime) {
                    const currentTime = playerRef.current.getCurrentTime();
                    onTimeUpdate(currentTime);
                  }
                }, 1000);
              }
            },
            onStateChange: (event: any) => {
              // Handle state changes if needed
            }
          }
        });
      };

      loadYouTubeAPI();

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        if (playerRef.current && playerRef.current.destroy) {
          playerRef.current.destroy();
        }
      };
    }, [videoId, onTimeUpdate]);

    return (
      <div className={`${className} bg-black rounded-lg overflow-hidden`}>
        <div
          ref={containerRef}
          className="w-full h-full"
        />
      </div>
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';

export default YouTubePlayer;