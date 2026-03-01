import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Trash2, PenLine, Type } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/helpers';

const SIGNATURE_FONTS = [
  { label: 'Cursive', value: 'cursive' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Script', value: '"Dancing Script", cursive' },
  { label: 'Handwriting', value: '"Caveat", cursive' },
];

export function SignatureDialog() {
  const setSignatureDialogOpen = useUIStore(s => s.setSignatureDialogOpen);
  const setPendingSignature = useUIStore(s => s.setPendingSignature);
  const setActiveTool = useUIStore(s => s.setActiveTool);

  const [tab, setTab] = useState<'draw' | 'type'>('draw');
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].value);
  const [isEmpty, setIsEmpty] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    lastPointRef.current = getPos(e, canvas);
    setIsEmpty(false);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);

    if (lastPointRef.current) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPointRef.current = pos;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const generateTypedSignature = (): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `52px ${selectedFont}`;
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedText, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  };

  const handleConfirm = () => {
    let imageData: string;

    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || isEmpty) return;
      imageData = canvas.toDataURL('image/png');
    } else {
      if (!typedText.trim()) return;
      imageData = generateTypedSignature();
    }

    setPendingSignature(imageData);
    setActiveTool('signature');
    setSignatureDialogOpen(false);
  };

  const canConfirm = tab === 'draw' ? !isEmpty : typedText.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] bg-surface-1 border border-border rounded-2xl shadow-elevation-3 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <PenLine size={18} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-on-surface">Create Signature</h2>
          </div>
          <button
            onClick={() => setSignatureDialogOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 text-on-surface-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4">
          <button
            onClick={() => setTab('draw')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === 'draw'
                ? 'bg-brand-500/15 text-brand-400'
                : 'text-on-surface-secondary hover:bg-white/5',
            )}
          >
            <PenLine size={13} />
            Draw
          </button>
          <button
            onClick={() => setTab('type')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === 'type'
                ? 'bg-brand-500/15 text-brand-400'
                : 'text-on-surface-secondary hover:bg-white/5',
            )}
          >
            <Type size={13} />
            Type
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === 'draw' ? (
            <div>
              <p className="text-xs text-on-surface-secondary mb-3">
                Draw your signature below using mouse or touch
              </p>
              <div className="relative rounded-xl overflow-hidden border border-border">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={160}
                  className="w-full touch-none cursor-crosshair block"
                  style={{ background: '#fff' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-sm text-gray-300 select-none">Sign here</span>
                  </div>
                )}
              </div>
              <button
                onClick={clearCanvas}
                className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-secondary hover:text-on-surface transition-colors"
              >
                <Trash2 size={12} />
                Clear
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs text-on-surface-secondary mb-3">
                Type your name and select a style
              </p>
              <input
                type="text"
                value={typedText}
                onChange={e => setTypedText(e.target.value)}
                placeholder="Your name"
                className="w-full h-10 px-3 rounded-xl border border-border bg-surface-2 text-on-surface text-sm placeholder:text-on-surface-secondary/50 focus:outline-none focus:border-brand-500 mb-3"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                {SIGNATURE_FONTS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setSelectedFont(f.value)}
                    className={cn(
                      'h-14 rounded-xl border-2 flex items-center justify-center transition-all',
                      selectedFont === f.value
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-border hover:border-border-strong bg-surface-2',
                    )}
                  >
                    <span style={{ fontFamily: f.value, fontSize: '22px', color: '#1e293b' }}>
                      {typedText || 'Signature'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={() => setSignatureDialogOpen(false)}
            className="px-4 py-2 rounded-xl text-sm text-on-surface-secondary hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Place Signature
          </button>
        </div>
      </div>
    </div>
  );
}
