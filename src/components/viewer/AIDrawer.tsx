import React, { useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X, Send, Sparkles, Trash2, Copy, Check, Bot, BookOpen, Languages, ListChecks, FileText } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { getPageText, renderPageThumbnail } from '@/utils/pdf';
import { askClaude, askClaudeVision } from '@/utils/ai';
import { cn } from '@/utils/helpers';

// ── Inline markdown renderer ─────────────────────────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key} className="list-disc list-inside space-y-0.5 my-1">
          {listItems.map((item, j) => <li key={j}>{formatInline(item)}</li>)}
        </ul>,
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.*)/);
    const numberedMatch = line.match(/^[\s]*\d+[.)]\s+(.*)/);

    if (bulletMatch || numberedMatch) {
      listItems.push((bulletMatch || numberedMatch)![1]);
      continue;
    }

    flushList(`list-${i}`);

    if (line.startsWith('### ')) {
      elements.push(<p key={i} className="font-semibold text-on-surface mt-2 mb-0.5">{formatInline(line.slice(4))}</p>);
    } else if (line.startsWith('## ')) {
      elements.push(<p key={i} className="font-semibold text-on-surface mt-2 mb-0.5">{formatInline(line.slice(3))}</p>);
    } else if (line.startsWith('# ')) {
      elements.push(<p key={i} className="font-bold text-on-surface mt-2 mb-0.5">{formatInline(line.slice(2))}</p>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i}>{formatInline(line)}</p>);
    }
  }

  flushList('list-end');
  return elements;
}

function formatInline(text: string) {
  // Bold, italic, inline code
  const parts: (string | React.JSX.Element)[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith('`')) {
      parts.push(<code key={match.index} className="px-1 py-0.5 rounded bg-surface-1 text-brand-300 text-[0.7rem] font-mono">{m.slice(1, -1)}</code>);
    } else if (m.startsWith('**')) {
      parts.push(<strong key={match.index} className="font-semibold text-on-surface">{m.slice(2, -2)}</strong>);
    } else if (m.startsWith('*')) {
      parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

// ── Quick action chips ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Summarize', icon: FileText, prompt: 'Summarize this page in a few bullet points.' },
  { label: 'Key Points', icon: ListChecks, prompt: 'What are the key points on this page?' },
  { label: 'Translate', icon: Languages, prompt: 'Translate this page content to English.' },
  { label: 'Explain', icon: BookOpen, prompt: 'Explain the content of this page in simple terms.' },
];

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="mr-auto flex items-start gap-2.5 max-w-[90%] animate-fade-in">
      <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center mt-0.5">
        <Bot size={12} className="text-white" />
      </div>
      <div className="bg-surface-3 rounded-2xl rounded-tl-md px-3.5 py-2.5">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-on-surface-secondary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-on-surface-secondary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-on-surface-secondary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-1 right-1 p-1 rounded-md bg-surface-2/80 backdrop-blur-sm hover:bg-surface-3 text-on-surface-secondary"
      title="Copy"
    >
      {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 350);
  }, [open]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '36px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(resizeTextarea, [input, resizeTextarea]);

  // ── Drag-to-close gesture ────────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; dragging: boolean }>({ startX: 0, dragging: false });
  const panelRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (dx > 0) panelRef.current.style.transform = `translateX(${dx}px)`;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dragging = false;
    panelRef.current.style.transform = '';
    if (dx > 80) setOpen(false);
  }, [setOpen]);

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = async (overrideText?: string) => {
    const q = (overrideText ?? input).trim();
    if (!q || loading || !activeTab) return;

    addMessage('user', q);
    if (!overrideText) setInput('');
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

        if (!pageText.trim()) {
          for (let p = startPage; p <= endPage; p++) {
            const page = await pdf.getPage(p);
            const img = await renderPageThumbnail(page, 800);
            pageImages.push(img);
          }
        }
      }

      // Build conversation history for context (last 6 messages)
      const history = messages.slice(-6).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`,
      ).join('\n');
      const fullQuestion = history ? `${history}\nUser: ${q}` : q;

      let answer: string;
      if (pageText.trim()) {
        answer = await askClaude(pageText, fullQuestion);
      } else if (pageImages.length > 0) {
        answer = await askClaudeVision(pageImages, fullQuestion);
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

  // Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] sm:bg-black/20 sm:backdrop-blur-none animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 right-0 bottom-0 z-40 flex flex-col',
          'w-full sm:w-[340px] bg-surface-2 border-l border-border shadow-elevation-4',
          'animate-slide-in-right',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-4 cursor-grab active:cursor-grabbing touch-none z-10 flex items-center"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="w-1 h-8 rounded-full bg-on-surface-secondary/20 ml-1" />
        </div>

        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <div className="relative shrink-0 overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 via-brand-400/5 to-transparent" />
          <div className="relative flex items-center gap-2.5 px-5 py-3.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-on-surface block">AI Assistant</span>
              {activeTab && (
                <span className="text-2xs text-on-surface-secondary truncate block">
                  {activeTab.name} &middot; page {activeTab.page}
                </span>
              )}
            </div>
            <button
              onClick={clearMessages}
              className="p-1.5 rounded-lg text-on-surface-secondary hover:bg-white/10 hover:text-on-surface transition-colors"
              title="Clear chat"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-on-surface-secondary hover:bg-white/10 hover:text-on-surface transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="h-px bg-gradient-to-r from-brand-500/20 via-border to-border" />
        </div>

        {/* ─── Messages ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scroll-smooth">
          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center pt-6 pb-2 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-400/20 to-brand-600/20 flex items-center justify-center mb-3">
                <Sparkles size={22} className="text-brand-400" />
              </div>
              <p className="text-sm font-medium text-on-surface mb-1">Ask me anything</p>
              <p className="text-2xs text-on-surface-secondary text-center max-w-[220px] mb-5">
                I can read this page and help you understand, summarize, or translate the content.
              </p>

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-2 w-full px-1">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.prompt)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-1 border border-border/50 text-xs text-on-surface-secondary hover:text-on-surface hover:border-brand-500/30 hover:bg-brand-500/5 transition-all group"
                  >
                    <action.icon size={13} className="shrink-0 text-brand-400/60 group-hover:text-brand-400 transition-colors" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            msg.role === 'user' ? (
              /* ── User bubble ─── */
              <div key={i} className="flex justify-end animate-fade-in">
                <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 bg-brand-500/15 border border-brand-500/10">
                  <p dir="auto" className="text-xs leading-relaxed text-on-surface whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ) : (
              /* ── AI bubble ─── */
              <div key={i} className="flex items-start gap-2.5 animate-fade-in group">
                <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center mt-0.5">
                  <Bot size={12} className="text-white" />
                </div>
                <div className="relative max-w-[85%] rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-surface-3 border border-border/30">
                  <div dir="auto" className="text-xs leading-relaxed text-on-surface space-y-1">
                    {renderMarkdown(msg.text)}
                  </div>
                  <CopyButton text={msg.text} />
                </div>
              </div>
            )
          ))}

          {loading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* ─── Input bar ───────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border bg-surface-2">
          <div className="px-3 py-2.5">
            <div className="flex items-end gap-2 bg-surface-1 border border-border rounded-2xl px-3 py-1.5 focus-within:border-brand-500/50 focus-within:shadow-glow transition-all">
              <textarea
                ref={textareaRef}
                dir="auto"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this page..."
                rows={1}
                className="flex-1 bg-transparent text-xs text-on-surface placeholder:text-on-surface-secondary/40 focus:outline-none resize-none leading-relaxed py-1"
                style={{ height: '36px', maxHeight: '120px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className={cn(
                  'shrink-0 w-8 h-8 flex items-center justify-center rounded-xl transition-all mb-0.5',
                  input.trim() && !loading
                    ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-glow active:scale-95'
                    : 'text-on-surface-secondary/30 cursor-not-allowed',
                )}
              >
                <Send size={13} />
              </button>
            </div>
            <p className="text-center text-2xs text-on-surface-secondary/30 mt-1.5">
              Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
