'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';

export default function Browser({ instanceId, appState, onStateChange }: AppWindowProps) {
  const [inputUrl, setInputUrl] = useState<string>((appState.url as string) || 'https://en.wikipedia.org');
  const [currentUrl, setCurrentUrl] = useState<string>((appState.url as string) || 'https://en.wikipedia.org');
  const [history, setHistory] = useState<string[]>([(appState.url as string) || 'https://en.wikipedia.org']);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync state with appState to persist URL
  useEffect(() => {
    onStateChange({ ...appState, url: currentUrl });
  }, [currentUrl]);

  // Listen for navigation messages from the proxy iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'BROWSER_NAVIGATE' && e.data.url) {
        // Only update input bar if the iframe actually navigated
        const newUrl = e.data.url;
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newUrl);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentUrl(newUrl);
        setInputUrl(newUrl);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [history, historyIndex]);

  function navigate(url: string) {
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(finalUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    setCurrentUrl(finalUrl);
    setInputUrl(finalUrl);
    setIsLoading(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (inputUrl) navigate(inputUrl);
  }

  function goBack() {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]);
      setInputUrl(history[newIndex]);
      setIsLoading(true);
    }
  }

  function goForward() {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]);
      setInputUrl(history[newIndex]);
      setIsLoading(true);
    }
  }

  function reload() {
    setIsLoading(true);
    if (iframeRef.current) {
      // Force iframe reload by re-setting src
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = currentSrc;
      }, 50);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white text-black" style={{ background: '#1e1e2e', color: '#cdd6f4' }}>
      {/* Address Bar */}
      <div 
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: '#11111b', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex gap-1">
          <button 
            onClick={goBack} 
            disabled={historyIndex <= 0}
            className="px-2 py-1 rounded text-sm disabled:opacity-30 hover:bg-white/10"
            title="Back"
          >←</button>
          <button 
            onClick={goForward} 
            disabled={historyIndex >= history.length - 1}
            className="px-2 py-1 rounded text-sm disabled:opacity-30 hover:bg-white/10"
            title="Forward"
          >→</button>
          <button 
            onClick={reload} 
            className="px-2 py-1 rounded text-sm hover:bg-white/10"
            title="Reload"
          >↻</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <div className="relative w-full flex items-center">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="w-full bg-transparent px-3 py-1 text-sm outline-none rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#cdd6f4', border: '1px solid rgba(255,255,255,0.1)' }}
              placeholder="Search or enter web address"
            />
            {isLoading && (
              <div className="absolute right-3 flex items-center">
                <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#89b4fa', borderTopColor: 'transparent' }} />
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Browser View */}
      <div className="flex-1 relative bg-white">
        <iframe
          ref={iframeRef}
          src={`/api/proxy?url=${encodeURIComponent(currentUrl)}`}
          className="absolute inset-0 w-full h-full border-none"
          sandbox="allow-scripts allow-forms allow-popups"
          onLoad={() => setIsLoading(false)}
          title="Browser View"
        />
      </div>
    </div>
  );
}
