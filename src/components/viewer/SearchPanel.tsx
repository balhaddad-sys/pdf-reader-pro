import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useSearchStore } from '@/stores/searchStore';
import { getPageTextCached, getIndexProgress, onIndexProgress } from '@/utils/textIndex';
import { getPageText } from '@/utils/pdf';
import { cn } from '@/utils/helpers';
import type { SearchMatch } from '@/stores/searchStore';

function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\u0640/g, '')
    .toLowerCase();
}

/** Clean OCR garbage from snippet — keep only real text around the match */
function cleanSnippet(raw: string, query: string): string {
  // Remove excessive whitespace and control chars
  let s = raw.replace(/[\x00-\x1f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Truncate to reasonable length
  if (s.length > 80) {
    // Try to center around the query
    const qNorm = normalizeForSearch(query);
    const sNorm = normalizeForSearch(s);
    const pos = sNorm.indexOf(qNorm);
    if (pos > 30) {
      s = '...' + s.slice(pos - 25);
    }
    if (s.length > 80) {
      s = s.slice(0, 77) + '...';
    }
  }
  return s;
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState('');
  const [indexPct, setIndexPct] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const setSearchOpen = useUIStore(s => s.setSearchOpen);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  const matches = useSearchStore(s => s.matches);
  const currentMatchIndex = useSearchStore(s => s.currentMatchIndex);
  const setMatches = useSearchStore(s => s.setMatches);
  const setCurrentMatchIndex = useSearchStore(s => s.setCurrentMatchIndex);
  const clearSearch = useSearchStore(s => s.clear);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;

  useEffect(() => {
    inputRef.current?.focus();
    return () => { clearSearch(); };
  }, []);

  // Track indexing progress
  useEffect(() => {
    if (!activeTab) return;
    const update = () => {
      const p = getIndexProgress(activeTab.documentId);
      if (!p || p.done || !p.isOcr) {
        setIndexPct(null);
      } else {
        setIndexPct(Math.round((p.indexed / p.total) * 100));
      }
    };
    update();
    return onIndexProgress(update);
  }, [activeTab?.documentId]);

  // Re-search when OCR finishes new pages
  const lastOcrCount = useRef(0);
  useEffect(() => {
    if (!activeTab || !query.trim()) return;
    const unsub = onIndexProgress(() => {
      const p = getIndexProgress(activeTab.documentId);
      if (!p || !p.isOcr) return;
      if (p.done || p.indexed - lastOcrCount.current >= 5) {
        lastOcrCount.current = p.indexed;
        performSearch();
      }
    });
    return unsub;
  }, [activeTab?.documentId, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clearSearch(); setSearchOpen(false); }
      if (e.key === 'Enter' && matches.length > 0) {
        e.shiftKey ? goToPrev() : goToNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matches, currentMatchIndex, setSearchOpen]);

  const performSearch = useCallback(async () => {
    if (!query.trim() || !pdf || !activeTab) {
      setMatches([]);
      setProgress('');
      return;
    }

    abortRef.current = false;
    setSearching(true);
    setProgress('');
    const found: SearchMatch[] = [];
    const queryNorm = normalizeForSearch(query);
    const totalPages = pdf.numPages;
    const docId = activeTab.documentId;

    for (let i = 1; i <= totalPages; i++) {
      if (abortRef.current) break;
      if (totalPages > 20) setProgress(`${i}/${totalPages}`);

      let text = getPageTextCached(docId, i);
      if (text === undefined) {
        const page = await pdf.getPage(i);
        text = await getPageText(page);
      }
      if (abortRef.current) break;

      const textNorm = normalizeForSearch(text);

      const normToOrig: number[] = [];
      let ni = 0;
      for (let oi = 0; oi < text.length; oi++) {
        const chunk = normalizeForSearch(text[oi]);
        for (let ci = 0; ci < chunk.length; ci++) {
          normToOrig[ni++] = oi;
        }
      }
      normToOrig[ni] = text.length;

      let idx = 0;
      while ((idx = textNorm.indexOf(queryNorm, idx)) !== -1) {
        const origStart = normToOrig[idx] ?? 0;
        const origEnd = normToOrig[idx + queryNorm.length] ?? text.length;
        found.push({
          page: i,
          charOffset: origStart,
          charLength: origEnd - origStart,
          snippet: text.slice(Math.max(0, origStart - 40), origEnd + 40),
        });
        idx += queryNorm.length;
      }
    }

    if (!abortRef.current) {
      setMatches(found);
      setSearching(false);
      setProgress('');
      if (found.length > 0) {
        setCurrentMatchIndex(0);
        updateTab(activeTab.id, { page: found[0].page });
      }
    }
  }, [query, pdf, activeTab, updateTab, setMatches, setCurrentMatchIndex]);

  useEffect(() => {
    abortRef.current = true;
    const timer = setTimeout(performSearch, 300);
    return () => { abortRef.current = true; clearTimeout(timer); };
  }, [performSearch]);

  // Auto-scroll result list to current match
  useEffect(() => {
    if (resultsRef.current && matches.length > 0) {
      const el = resultsRef.current.children[currentMatchIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [currentMatchIndex, matches.length]);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(next);
    if (activeTab) updateTab(activeTab.id, { page: matches[next].page });
  }, [matches, currentMatchIndex, activeTab, updateTab, setCurrentMatchIndex]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prev);
    if (activeTab) updateTab(activeTab.id, { page: matches[prev].page });
  }, [matches, currentMatchIndex, activeTab, updateTab, setCurrentMatchIndex]);

  const close = () => {
    abortRef.current = true;
    clearSearch();
    setSearchOpen(false);
  };

  const hasResults = matches.length > 0;
  const noResults = !searching && query.trim() && matches.length === 0;

  return (
    <div className="absolute top-0 right-0 z-20 m-3 animate-slide-down w-80 max-w-[calc(100vw-1.5rem)]">
      {/* Search bar */}
      <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded-xl shadow-elevation-3 px-2 py-1">
        <Search size={14} className="text-on-surface-secondary shrink-0" />
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search in document..."
          className="flex-1 min-w-0 h-7 text-sm bg-transparent text-on-surface placeholder:text-on-surface-secondary/50 focus:outline-none"
        />

        {query && (
          <span className="text-2xs text-on-surface-secondary whitespace-nowrap flex items-center gap-1 tabular-nums">
            {searching ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                <span>{progress || '...'}</span>
              </>
            ) : hasResults ? (
              <span className="font-medium">{currentMatchIndex + 1}/{matches.length}</span>
            ) : (
              <span>0</span>
            )}
          </span>
        )}

        <div className="flex items-center">
          <button onClick={goToPrev} disabled={!hasResults}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-opacity">
            <ChevronUp size={14} />
          </button>
          <button onClick={goToNext} disabled={!hasResults}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-opacity">
            <ChevronDown size={14} />
          </button>
        </div>

        <button onClick={close}
          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 shrink-0">
          <X size={14} />
        </button>
      </div>

      {/* OCR progress bar */}
      {indexPct !== null && (
        <div className="mt-1.5 mx-1">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 size={10} className="animate-spin text-brand-400 shrink-0" />
            <span className="text-2xs text-on-surface-secondary">
              Indexing document... {indexPct}%
            </span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${indexPct}%` }}
            />
          </div>
        </div>
      )}

      {/* No results message */}
      {noResults && (
        <div className="mt-1.5 px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs text-on-surface-secondary text-center">
          {indexPct !== null
            ? 'No results yet — still indexing...'
            : 'No results found'
          }
        </div>
      )}

      {/* Results list */}
      {hasResults && (
        <div
          ref={resultsRef}
          className="mt-1.5 bg-surface-2 border border-border rounded-xl shadow-elevation-3 max-h-72 overflow-y-auto divide-y divide-white/5"
        >
          {matches.slice(0, 100).map((match, idx) => (
            <button
              key={`${match.page}-${match.charOffset}-${idx}`}
              onClick={() => {
                setCurrentMatchIndex(idx);
                if (activeTab) updateTab(activeTab.id, { page: match.page });
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors',
                idx === currentMatchIndex
                  ? 'bg-brand-500/15 text-on-surface'
                  : 'text-on-surface-secondary hover:bg-white/5',
              )}
            >
              <span className={cn(
                'text-2xs font-mono shrink-0 px-1.5 py-0.5 rounded',
                idx === currentMatchIndex
                  ? 'bg-brand-500/20 text-brand-300'
                  : 'bg-white/5 text-on-surface-secondary/70',
              )}>
                {match.page}
              </span>
              <span dir="auto" className="truncate">
                {cleanSnippet(match.snippet, query)}
              </span>
            </button>
          ))}
          {matches.length > 100 && (
            <div className="px-3 py-2 text-2xs text-on-surface-secondary/50 text-center">
              +{matches.length - 100} more results
            </div>
          )}
        </div>
      )}
    </div>
  );
}
