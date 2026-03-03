import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { getPageText, renderPageThumbnail } from '@/utils/pdf';
import { askGemini, askGeminiVision } from '@/utils/ai';
import { cn } from '@/utils/helpers';

export function AIDrawer() {
  const open = useUIStore(s => s.aiDrawerOpen);
  const setOpen = useUIStore(s => s.setAiDrawerOpen);
  const messages = useUIStore(s => s.aiMessages);
  const addMessage = useUIStore(s => s.addAiMessage);
  const clearMessages = useUIStore(s => s.clearAiMessages);

  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);
  const activeTab = tabs.find(t => t.id === activeTabId);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
  }, [open]);

  // ── Drag-to-close gesture ──────────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; dragging: boolean }>({ startX: 0, dragging: false });
  const panelRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (dx > 0) {
      panelRef.current.style.transform = `translateX(${dx}px)`;
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dragging = false;
    panelRef.current.style.transform = '';
    if (dx > 80) setOpen(false);
  }, [setOpen]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading || !activeTab) return;

    addMessage('user', q);
    setInput('');
    setLoading(true);

    try {
      const pdf = getPdfInstance(activeTab.documentId);
      let pageText = '';
      const pageImages: string[] = [];
      if (pdf) {
        const currentPage = activeTab.page;
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(pdf.numPages, currentPage + 2);
        const textParts: string[] = [];
        for (let p = startPage; p <= endPage; p++) {
          const page = await pdf.getPage(p);
          const text = await getPageText(page);
          if (text.trim()) {
            textParts.push(p === currentPage ? `[CURRENT PAGE ${p}]\n${text}` : `[PAGE ${p}]\n${text}`);
          }
        }
        pageText = textParts.join('\n\n');

        // If no text found, render pages as images for vision
        if (!pageText.trim()) {
          for (let p = startPage; p <= endPage; p++) {
            const page = await pdf.getPage(p);
            const img = await renderPageThumbnail(page, 800);
            pageImages.push(img);
          }
        }
      }

      let answer: string;
      if (pageText.trim()) {
        answer = await askGemini(pageText, q);
      } else if (pageImages.length > 0) {
        answer = await askGeminiVision(pageImages, q);
      } else {
        answer = 'No PDF content available. Please open a document first.';
      }
      addMessage('ai', answer);
    } catch (err) {
      addMessage('ai', `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — tap to close on mobile */}
      <div
        className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent sm:pointer-events-none"
        onClick={() => setOpen(false)}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 right-0 bottom-0 z-40 flex flex-col',
          'w-full sm:w-80 bg-surface-2 border-l border-border shadow-elevation-3',
          'transition-transform duration-300 ease-out',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-3 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Sparkles size={18} className="text-brand-400" />
          <span className="text-sm font-semibold text-on-surface flex-1">AI Assistant</span>
          <button
            onClick={clearMessages}
            className="p-1.5 rounded-lg text-on-surface-secondary hover:bg-white/10 transition-colors"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-on-surface-secondary hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Page badge */}
        {activeTab && (
          <div className="px-4 py-2 text-2xs text-on-surface-secondary border-b border-border/50 bg-surface-1/50">
            Reading <span className="font-medium text-on-surface">pages {Math.max(1, activeTab.page - 2)}–{activeTab.page}+</span> of {activeTab.name}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-on-surface-secondary text-xs mt-8 space-y-2">
              <Sparkles size={24} className="mx-auto text-brand-400/50" />
              <p>Ask me anything about this page</p>
              <p className="text-2xs">I can summarize, explain, translate, or answer questions about the content.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'text-xs leading-relaxed rounded-xl px-3 py-2 max-w-[90%]',
                msg.role === 'user'
                  ? 'ml-auto bg-brand-500/20 text-on-surface'
                  : 'mr-auto bg-surface-3 text-on-surface',
              )}
            >
              <p dir="auto" className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          ))}
          {loading && (
            <div className="mr-auto flex items-center gap-2 text-xs text-on-surface-secondary px-3 py-2">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-3 py-3 border-t border-border shrink-0">
          <form
            onSubmit={e => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about this page..."
              className="flex-1 h-9 px-3 text-xs rounded-xl bg-surface-1 border border-border text-on-surface placeholder:text-on-surface-secondary/50 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className={cn(
                'shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-colors',
                input.trim() && !loading
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-surface-1 text-on-surface-secondary/40 cursor-not-allowed',
              )}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
