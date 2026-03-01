export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const ZOOM_LEVELS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];

export function getNextZoom(current: number): number {
  for (const level of ZOOM_LEVELS) {
    if (level > current + 0.01) return level;
  }
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
}

export function getPrevZoom(current: number): number {
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < current - 0.01) return ZOOM_LEVELS[i];
  }
  return ZOOM_LEVELS[0];
}

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fde047' },
  { name: 'Green', value: '#86efac' },
  { name: 'Blue', value: '#93c5fd' },
  { name: 'Pink', value: '#f9a8d4' },
  { name: 'Purple', value: '#c4b5fd' },
  { name: 'Orange', value: '#fdba74' },
] as const;

export const ANNOTATION_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
  '#000000', '#ffffff',
] as const;

export const STAMP_DEFINITIONS = [
  { id: 'approved', label: 'APPROVED', color: '#16a34a', borderColor: '#16a34a', bgColor: '#f0fdf4' },
  { id: 'rejected', label: 'REJECTED', color: '#dc2626', borderColor: '#dc2626', bgColor: '#fef2f2' },
  { id: 'draft', label: 'DRAFT', color: '#2563eb', borderColor: '#2563eb', bgColor: '#eff6ff' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#dc2626', borderColor: '#dc2626', bgColor: '#fef2f2' },
  { id: 'reviewed', label: 'REVIEWED', color: '#0d9488', borderColor: '#0d9488', bgColor: '#f0fdfa' },
  { id: 'for-review', label: 'FOR REVIEW', color: '#d97706', borderColor: '#d97706', bgColor: '#fffbeb' },
  { id: 'final', label: 'FINAL', color: '#7c3aed', borderColor: '#7c3aed', bgColor: '#f5f3ff' },
  { id: 'void', label: 'VOID', color: '#6b7280', borderColor: '#6b7280', bgColor: '#f9fafb' },
] as const;

export function generateStampImage(label: string, color: string, bgColor: string): string {
  const canvas = document.createElement('canvas');
  const padding = 20;
  const fontSize = 28;
  const borderWidth = 3;

  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  const textWidth = ctx.measureText(label).width;

  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 1.5;

  ctx.fillStyle = bgColor + 'dd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = color;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL('image/png');
}
