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
