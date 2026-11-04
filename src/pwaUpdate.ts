/**
 * Switches to a downloaded update and reloads (T8).
 *
 * The plugin's own updateServiceWorker() only reloads when the browser fires
 * `controllerchange`. In the iPhone Home Screen app that event doesn't always
 * arrive, so tapping Update did nothing until the app was force-closed. Here we
 * reload as soon as the new version takes over, or after a short wait at most.
 * If it hasn't taken over by then, the reload still loads it in most cases, and
 * at worst shows the banner again.
 */
export interface ApplyUpdateOptions {
  getRegistration?: () => Promise<ServiceWorkerRegistration | undefined>;
  container?: Pick<ServiceWorkerContainer, 'addEventListener' | 'removeEventListener'>;
  reload?: () => void;
  timeoutMs?: number;
}

export const UPDATE_TIMEOUT_MS = 3000;

export async function applyUpdate({
  getRegistration = () => navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined),
  container = navigator.serviceWorker,
  reload = () => window.location.reload(),
  timeoutMs = UPDATE_TIMEOUT_MS,
}: ApplyUpdateOptions = {}): Promise<void> {
  let waiting: ServiceWorker | null | undefined;
  try {
    waiting = (await getRegistration())?.waiting;
  } catch {
    waiting = null;
  }
  if (waiting && container) {
    const worker = waiting;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(finish, timeoutMs);
      function onState() {
        if (worker.state === 'activated') finish();
      }
      function finish() {
        clearTimeout(timer);
        container.removeEventListener('controllerchange', finish);
        worker.removeEventListener('statechange', onState);
        resolve();
      }
      container.addEventListener('controllerchange', finish);
      worker.addEventListener('statechange', onState);
      // The generated service worker calls skipWaiting() on this message.
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  }
  reload();
}
