import { create } from 'zustand';
import type { Theme, SidebarPanel, ViewMode, AnnotationTool, ShapeSubType } from '@/types';

interface UIState {
  // View
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Sidebar
  sidebarOpen: boolean;
  sidebarPanel: SidebarPanel;
  toggleSidebar: () => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  openSidebar: (panel: SidebarPanel) => void;

  // Toolbar
  toolbarCollapsed: boolean;
  setToolbarCollapsed: (collapsed: boolean) => void;
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  activeColor: string;
  setActiveColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  shapeSubType: ShapeSubType;
  setShapeSubType: (type: ShapeSubType) => void;

  // Signature & Stamp placement
  signatureDialogOpen: boolean;
  setSignatureDialogOpen: (open: boolean) => void;
  pendingSignature: string | null;
  setPendingSignature: (data: string | null) => void;
  stampPickerOpen: boolean;
  setStampPickerOpen: (open: boolean) => void;
  pendingStamp: { imageData: string; label: string } | null;
  setPendingStamp: (stamp: { imageData: string; label: string } | null) => void;

  // Modals & panels
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  // AI assistant drawer
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  aiMessages: { role: 'user' | 'ai'; text: string }[];
  addAiMessage: (role: 'user' | 'ai', text: string) => void;
  clearAiMessages: () => void;

  // Reading mode
  focusMode: boolean;
  setFocusMode: (focus: boolean) => void;
  presentationMode: boolean;
  setPresentationMode: (presentation: boolean) => void;

  // Toast
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: 'library',
  setViewMode: (mode) => set({ viewMode: mode }),

  theme: (localStorage.getItem('theme') as Theme) || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  sidebarOpen: false,
  sidebarPanel: 'thumbnails',
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  openSidebar: (panel) => set({ sidebarOpen: true, sidebarPanel: panel }),

  toolbarCollapsed: false,
  setToolbarCollapsed: (collapsed) => set({ toolbarCollapsed: collapsed }),
  activeTool: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
  activeColor: '#fde047',
  setActiveColor: (color) => set({ activeColor: color }),
  strokeWidth: 2,
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  shapeSubType: 'rectangle',
  setShapeSubType: (type) => set({ shapeSubType: type }),

  signatureDialogOpen: false,
  setSignatureDialogOpen: (open) => set({ signatureDialogOpen: open }),
  pendingSignature: null,
  setPendingSignature: (data) => set({ pendingSignature: data }),
  stampPickerOpen: false,
  setStampPickerOpen: (open) => set({ stampPickerOpen: open }),
  pendingStamp: null,
  setPendingStamp: (stamp) => set({ pendingStamp: stamp }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  aiDrawerOpen: false,
  setAiDrawerOpen: (open) => set({ aiDrawerOpen: open }),
  aiMessages: [],
  addAiMessage: (role, text) => set(s => ({ aiMessages: [...s.aiMessages, { role, text }] })),
  clearAiMessages: () => set({ aiMessages: [] }),

  focusMode: false,
  setFocusMode: (focus) => set({ focusMode: focus }),
  presentationMode: false,
  setPresentationMode: (presentation) => set({ presentationMode: presentation }),

  toasts: [],
  addToast: (message, type = 'info') => {
    const id = `toast-${Date.now()}`;
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
