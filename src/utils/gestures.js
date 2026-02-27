/**
 * Touch gesture recognizer for pinch-to-zoom and swipe.
 * Uses non-passive listeners only during active gestures to avoid
 * blocking the browser's scroll compositor.
 */

export default class GestureHandler {
  constructor(element, callbacks = {}) {
    this.el = element;
    this.callbacks = callbacks;
    this._touches = null;
    this._initialDistance = 0;
    this._initialScale = 1;
    this._pinching = false;

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    this.el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.el.addEventListener('touchend', this._onTouchEnd, { passive: true });
    this.el.addEventListener('touchcancel', this._onTouchEnd, { passive: true });
  }

  _onTouchStart(e) {
    if (e.touches.length === 2) {
      this._pinching = true;
      this._touches = e.touches;
      this._initialDistance = this._getDistance(e.touches);
      this._initialScale = this.callbacks.getScale?.() || 1;

      // Add non-passive move listener only during pinch
      this.el.addEventListener('touchmove', this._onTouchMove, { passive: false });

      const center = this._getCenter(e.touches);
      this.callbacks.onPinchStart?.(center);
    }
  }

  _onTouchMove(e) {
    if (!this._pinching || e.touches.length !== 2) return;
    e.preventDefault(); // Prevent scroll during pinch

    const distance = this._getDistance(e.touches);
    const ratio = distance / this._initialDistance;
    const newScale = this._initialScale * ratio;
    const center = this._getCenter(e.touches);

    this.callbacks.onPinch?.(newScale, center);
  }

  _onTouchEnd(e) {
    if (this._pinching && e.touches.length < 2) {
      this._pinching = false;
      this.el.removeEventListener('touchmove', this._onTouchMove);
      this.callbacks.onPinchEnd?.();
    }
  }

  _getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  destroy() {
    this.el.removeEventListener('touchstart', this._onTouchStart);
    this.el.removeEventListener('touchmove', this._onTouchMove);
    this.el.removeEventListener('touchend', this._onTouchEnd);
    this.el.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
