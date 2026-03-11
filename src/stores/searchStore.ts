import { create } from 'zustand';

export interface SearchMatch {
  page: number;
  /** Character offset in the concatenated page text */
  charOffset: number;
  /** Length of the match in the concatenated page text */
  charLength: number;
  /** Context snippet for the results list */
  snippet: string;
}

interface SearchState {
  /** All matches across the document */
  matches: SearchMatch[];
  /** Index of the currently selected match */
  currentMatchIndex: number;
  /** Incremented when the selected match changes, to trigger scroll-into-view */
  scrollTrigger: number;

  setMatches: (matches: SearchMatch[]) => void;
  setCurrentMatchIndex: (idx: number) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  matches: [],
  currentMatchIndex: 0,
  scrollTrigger: 0,

  setMatches: (matches) => set({ matches }),
  setCurrentMatchIndex: (idx) => set({ currentMatchIndex: idx, scrollTrigger: Date.now() }),
  clear: () => set({ matches: [], currentMatchIndex: 0, scrollTrigger: 0 }),
}));
