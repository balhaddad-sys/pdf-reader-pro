/** Platform detection utilities */

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/.test(navigator.userAgent);

export const isMobile = isIOS || isAndroid || window.innerWidth < 768;

export const isCapacitor = typeof window.Capacitor !== 'undefined';

export const supportsTouchEvents = 'ontouchstart' in window;

export const dpr = Math.min(window.devicePixelRatio || 1, 3);

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
