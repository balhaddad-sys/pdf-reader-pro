import { create } from 'zustand';
import type { Annotation, Bookmark } from '@/types';
import * as db from '@/utils/db';
import { generateId } from '@/utils/helpers';

interface AnnotationState {
  annotations: Annotation[];
  bookmarks: Bookmark[];
  undoStack: Annotation[][];
  redoStack: Annotation[][];

  loadAnnotations: (documentId: string) => Promise<void>;
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Annotation>;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => Promise<void>;
  removeAnnotation: (id: string) => Promise<void>;
  clearAnnotations: () => void;

  loadBookmarks: (documentId: string) => Promise<void>;
  addBookmark: (documentId: string, page: number, label?: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  isPageBookmarked: (page: number) => boolean;
  clearBookmarks: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  bookmarks: [],
  undoStack: [],
  redoStack: [],

  loadAnnotations: async (documentId: string) => {
    const annotations = await db.getAnnotations(documentId);
    set({ annotations, undoStack: [], redoStack: [] });
  },

  addAnnotation: async (partial) => {
    const annotation: Annotation = {
      ...partial,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.saveAnnotation(annotation);

    set(state => ({
      annotations: [...state.annotations, annotation],
      undoStack: [...state.undoStack, state.annotations],
      redoStack: [],
    }));

    return annotation;
  },

  updateAnnotation: async (id, updates) => {
    const annotation = get().annotations.find(a => a.id === id);
    if (!annotation) return;

    const updated = { ...annotation, ...updates, updatedAt: Date.now() };
    await db.saveAnnotation(updated);

    set(state => ({
      annotations: state.annotations.map(a => (a.id === id ? updated : a)),
    }));
  },

  removeAnnotation: async (id) => {
    await db.deleteAnnotation(id);
    set(state => ({
      annotations: state.annotations.filter(a => a.id !== id),
      undoStack: [...state.undoStack, state.annotations],
      redoStack: [],
    }));
  },

  clearAnnotations: () => set({ annotations: [], undoStack: [], redoStack: [] }),

  loadBookmarks: async (documentId: string) => {
    const bookmarks = await db.getBookmarks(documentId);
    set({ bookmarks });
  },

  addBookmark: async (documentId, page, label) => {
    const bookmark: Bookmark = {
      id: generateId(),
      documentId,
      page,
      label: label || `Page ${page}`,
      createdAt: Date.now(),
    };
    await db.saveBookmark(bookmark);
    set(state => ({ bookmarks: [...state.bookmarks, bookmark] }));
  },

  removeBookmark: async (id) => {
    await db.deleteBookmark(id);
    set(state => ({ bookmarks: state.bookmarks.filter(b => b.id !== id) }));
  },

  isPageBookmarked: (page) => get().bookmarks.some(b => b.page === page),

  clearBookmarks: () => set({ bookmarks: [] }),

  undo: () => {
    const { undoStack, annotations } = get();
    if (undoStack.length === 0) return;

    const previousState = undoStack[undoStack.length - 1];
    set({
      annotations: previousState,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, annotations],
    });
  },

  redo: () => {
    const { redoStack, annotations } = get();
    if (redoStack.length === 0) return;

    const nextState = redoStack[redoStack.length - 1];
    set({
      annotations: nextState,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, annotations],
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
