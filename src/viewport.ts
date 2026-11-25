/**
 * Works around an iOS quirk: in a Home Screen app with a translucent status
 * bar, iOS reports the viewport (100vh, 100dvh, innerHeight and even fixed
 * `inset: 0`) as the screen height minus the status bar, leaving an empty
 * band at the bottom. In that case the app really does fill the whole
 * screen, so use the screen's height instead.
 *
 * Sets `--app-height` on <html>; full-screen layouts use it for their height.
 */

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function appHeight(): number {
  const inner = window.innerHeight;
  const portrait = window.innerWidth < inner;
  // iOS keeps screen.height as the portrait height regardless of rotation.
  if (isStandalone() && portrait && window.screen.height > inner) return window.screen.height;
  return inner;
}

/**
 * Stops pinch-to-zoom. iOS ignores `user-scalable=no` in the viewport meta
 * tag, so cancel WebKit's gesture events and any two-finger touch move.
 * One-finger scrolling is untouched.
 */
export function blockZoom(): () => void {
  const cancel = (e: Event) => e.preventDefault();
  const cancelMultiTouch = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  };
  const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
  gestures.forEach((g) => document.addEventListener(g, cancel, { passive: false }));
  document.addEventListener('touchmove', cancelMultiTouch, { passive: false });
  return () => {
    gestures.forEach((g) => document.removeEventListener(g, cancel));
    document.removeEventListener('touchmove', cancelMultiTouch);
  };
}

export function trackAppHeight(): () => void {
  const update = () => document.documentElement.style.setProperty('--app-height', `${appHeight()}px`);
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
}

/**
 * Keeps vertical swipes on a sheet from scrolling the page behind it. iOS
 * passes a swipe on to the page when the sheet has nothing left to scroll
 * that way (or fits without scrolling), so cancel exactly those moves. The
 * sheet still scrolls, and sideways swipes (a row of filter tags) are left
 * alone.
 */
export function containScroll(el: HTMLElement): () => void {
  let lastX = 0;
  let lastY = 0;
  const start = (e: TouchEvent) => {
    lastX = e.touches[0]?.clientX ?? 0;
    lastY = e.touches[0]?.clientY ?? 0;
  };
  const move = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return;
    const dx = touch.clientX - lastX;
    const dy = touch.clientY - lastY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    if (Math.abs(dx) > Math.abs(dy)) return;
    // Finger moving down scrolls up; finger moving up scrolls down.
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if ((dy > 0 && atTop) || (dy < 0 && atBottom)) e.preventDefault();
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
  };
}
