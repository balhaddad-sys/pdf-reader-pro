import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { getPageText } from '@/utils/pdf';
import { cn } from '@/utils/helpers';
import type { SearchResult } from '@/types';

/**
 * Normalize text for search: strip Arabic diacritics (harakat/tashkeel),
 * normalize Unicode (NFKD), and lowercase.
 */
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    // Strip Arabic diacritics: Fathah, Dammah, Kasrah, Shadda, Sukun,
    // Fathatan, Dammatan, Kasratan, superscript Alef, Quranic marks, Tatweel
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0640]/g, '')
    .toLowerCase();
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setSearchOpen = useUIStore(s => s.setSearchOpen);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
      if (e.key === 'Enter' && results.length > 0) {
        if (e.shiftKey) {
          goToPrev();
        } else {
          goToNext();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, currentIndex, setSearchOpen]);

  const performSearch = useCallback(async () => {
    if (!query.trim() || !pdf) {
      setResults([]);
      return;
    }

    setSearching(true);
    const found: SearchResult[] = [];
    const queryNorm = normalizeForSearch(query);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await getPageText(page);
      const textNorm = normalizeForSearch(text);

      // Build a mapping from normalized index → original index so we can
      // extract the correct context snippet from the original text.
      const normToOrig: number[] = [];
      let ni = 0;
      for (let oi = 0; oi < text.length; oi++) {
        const chunk = normalizeForSearch(text[oi]);
        for (let ci = 0; ci < chunk.length; ci++) {
          normToOrig[ni++] = oi;
        }
      }
      // Sentinel: map past-end of normalized text to end of original
      normToOrig[ni] = text.length;

      let idx = 0;
      while ((idx = textNorm.indexOf(queryNorm, idx)) !== -1) {
        const origStart = normToOrig[idx] ?? 0;
        const origEnd = normToOrig[idx + queryNorm.length] ?? text.length;
        found.push({
          page: i,
          index: origStart,
          text: text.slice(Math.max(0, origStart - 30), origEnd + 30),
        });
        idx += queryNorm.length;
      }
    }

    setResults(found);
    setCurrentIndex(0);
    setSearching(false);

    if (found.length > 0 && activeTab) {
      updateTab(activeTab.id, { page: found[0].page });
    }
  }, [query, pdf, activeTab, updateTab]);

  useEffect(() => {
    const timer = setTimeout(performSearch, 300);
    return () => clearTimeout(timer);
  }, [performSearch]);

  const goToNext = () => {
    if (results.length === 0) return;
    const next = (currentIndex + 1) % results.length;
    setCurrentIndex(next);
    if (activeTab) updateTab(activeTab.id, { page: results[next].page });
  };

  const goToPrev = () => {
    if (results.length === 0) return;
    const prev = (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(prev);
    if (activeTab) updateTab(activeTab.id, { page: results[prev].page });
  };

  return (
    <div className="absolute top-0 right-0 z-20 m-3 animate-slide-down">
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl shadow-elevation-3 p-1.5">
        <Search size={14} className="text-on-surface-secondary ml-1.5" />
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search in document..."
          className="w-56 h-7 text-sm bg-transparent text-on-surface placeholder:text-on-surface-secondary/50 focus:outline-none"
        />

        {query && (
          <span className="text-2xs text-on-surface-secondary whitespace-nowrap px-1">
            {results.length > 0 ? `${currentIndex + 1}/${results.length}` : searching ? '...' : '0'}
          </span>
        )}

        <div className="flex items-center gap-0.5">
          <button
            onClick={goToPrev}
            disabled={results.length === 0}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={goToNext}
            disabled={results.length === 0}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <button
          onClick={() => setSearchOpen(false)}
          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10"
        >
          <X size={14} />
        </button>
      </div>

      {/* Results list */}
      {results.length > 0 && (
        <div className="mt-1 bg-surface-2 border border-border rounded-xl shadow-elevation-3 max-h-64 overflow-y-auto">
          {results.slice(0, 50).map((result, idx) => (
            <button
              key={`${result.page}-${result.index}`}
              onClick={() => {
                setCurrentIndex(idx);
                if (activeTab) updateTab(activeTab.id, { page: result.page });
              }}
              className={cn(
                'w-full flex items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                idx === currentIndex ? 'bg-brand-500/10' : 'hover:bg-white/5',
              )}
            >
              <span className="text-2xs text-on-surface-secondary font-mono shrink-0 mt-0.5">
                p.{result.page}
              </span>
              <span dir="auto" className="text-on-surface-secondary truncate">
                {result.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
