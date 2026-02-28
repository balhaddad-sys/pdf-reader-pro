import { create } from 'zustand';
import type { PDFDocument, TabInfo, LibrarySort, LibraryLayout } from '@/types';
import * as db from '@/utils/db';
import { generateId } from '@/utils/helpers';
import { loadPDF, renderPageThumbnail } from '@/utils/pdf';
import type { PDFDocumentProxy } from '@/utils/pdf';

interface DocumentState {
  // Library
  documents: PDFDocument[];
  librarySort: LibrarySort;
  libraryLayout: LibraryLayout;
  librarySearch: string;
  isLoading: boolean;

  // Tabs & active document
  tabs: TabInfo[];
  activeTabId: string | null;
  pdfInstances: Map<string, PDFDocumentProxy>;

  // Actions
  loadDocuments: () => Promise<void>;
  importFile: (file: File) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  updateDocument: (id: string, updates: Partial<PDFDocument>) => Promise<void>;
  setLibrarySort: (sort: LibrarySort) => void;
  setLibraryLayout: (layout: LibraryLayout) => void;
  setLibrarySearch: (search: string) => void;

  // Tab actions
  openDocument: (id: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<TabInfo>) => void;
  getPdfInstance: (documentId: string) => PDFDocumentProxy | undefined;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  librarySort: 'recent',
  libraryLayout: 'grid',
  librarySearch: '',
  isLoading: false,
  tabs: [],
  activeTabId: null,
  pdfInstances: new Map(),

  loadDocuments: async () => {
    set({ isLoading: true });
    const documents = await db.getAllDocuments();
    set({ documents, isLoading: false });
  },

  importFile: async (file: File) => {
    if (file.size === 0) {
      throw new Error('The selected file is empty');
    }

    const id = generateId();
    const data = await file.arrayBuffer();

    // Validate PDF magic bytes (%PDF)
    const header = new Uint8Array(data, 0, Math.min(4, data.byteLength));
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
      throw new Error('The file is not a valid PDF');
    }

    // Load PDF to get metadata
    const pdf = await loadPDF(data);
    const firstPage = await pdf.getPage(1);
    const thumbnail = await renderPageThumbnail(firstPage);

    const doc: PDFDocument = {
      id,
      name: file.name.replace(/\.pdf$/i, ''),
      size: file.size,
      pageCount: pdf.numPages,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      lastPage: 1,
      zoom: 1,
      thumbnail,
      tags: [],
      favorite: false,
    };

    await db.saveDocument(doc);
    await db.saveFile(id, data);
    await db.saveThumbnail(id, thumbnail);

    // Keep PDF instance for immediate viewing
    get().pdfInstances.set(id, pdf);

    set(state => ({
      documents: [doc, ...state.documents],
    }));

    return id;
  },

  removeDocument: async (id: string) => {
    await db.deleteDocument(id);
    const instance = get().pdfInstances.get(id);
    if (instance) {
      instance.destroy();
      get().pdfInstances.delete(id);
    }
    set(state => ({
      documents: state.documents.filter(d => d.id !== id),
      tabs: state.tabs.filter(t => t.documentId !== id),
      activeTabId: state.activeTabId && state.tabs.find(t => t.id === state.activeTabId)?.documentId === id
        ? (state.tabs.find(t => t.documentId !== id)?.id ?? null)
        : state.activeTabId,
    }));
  },

  toggleFavorite: async (id: string) => {
    const doc = get().documents.find(d => d.id === id);
    if (!doc) return;
    const updated = { ...doc, favorite: !doc.favorite };
    await db.saveDocument(updated);
    set(state => ({
      documents: state.documents.map(d => (d.id === id ? updated : d)),
    }));
  },

  updateDocument: async (id: string, updates: Partial<PDFDocument>) => {
    const doc = get().documents.find(d => d.id === id);
    if (!doc) return;
    const updated = { ...doc, ...updates };
    await db.saveDocument(updated);
    set(state => ({
      documents: state.documents.map(d => (d.id === id ? updated : d)),
    }));
  },

  setLibrarySort: (sort) => set({ librarySort: sort }),
  setLibraryLayout: (layout) => set({ libraryLayout: layout }),
  setLibrarySearch: (search) => set({ librarySearch: search }),

  openDocument: async (id: string) => {
    const { tabs, pdfInstances } = get();

    // Check if already open in a tab
    const existingTab = tabs.find(t => t.documentId === id);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    // Load PDF if not cached
    if (!pdfInstances.has(id)) {
      const fileData = await db.getFile(id);
      if (!fileData) return;
      const pdf = await loadPDF(fileData);
      pdfInstances.set(id, pdf);
    }

    const doc = get().documents.find(d => d.id === id);
    if (!doc) return;

    // Update last opened
    await get().updateDocument(id, { lastOpenedAt: Date.now() });

    const tab: TabInfo = {
      id: generateId(),
      documentId: id,
      name: doc.name,
      page: doc.lastPage || 1,
      zoom: doc.zoom || 1,
    };

    set(state => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const tab = tabs[tabIndex];

    if (tab) {
      // Save position
      const doc = get().documents.find(d => d.id === tab.documentId);
      if (doc) {
        get().updateDocument(tab.documentId, {
          lastPage: tab.page,
          zoom: tab.zoom,
        });
      }

      // Check if any other tab uses the same document
      const otherTabWithSameDoc = tabs.find(t => t.id !== tabId && t.documentId === tab.documentId);
      if (!otherTabWithSameDoc) {
        const instance = get().pdfInstances.get(tab.documentId);
        if (instance) {
          instance.destroy();
          get().pdfInstances.delete(tab.documentId);
        }
      }
    }

    const newTabs = tabs.filter(t => t.id !== tabId);
    let newActiveId = activeTabId;

    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const nextIndex = Math.min(tabIndex, newTabs.length - 1);
        newActiveId = newTabs[nextIndex].id;
      } else {
        newActiveId = null;
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId: string) => set({ activeTabId: tabId }),

  updateTab: (tabId: string, updates: Partial<TabInfo>) => {
    set(state => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, ...updates } : t)),
    }));
  },

  getPdfInstance: (documentId: string) => get().pdfInstances.get(documentId),
}));
