import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate } from './pwaUpdate';

/** A minimal stand-in for a waiting service worker and the page's container. */
function fakes() {
  const container = new EventTarget();
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn() });
  const registration = { waiting: worker } as unknown as ServiceWorkerRegistration;
  const reload = vi.fn();
  return { container, worker, registration, reload };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('applyUpdate (T8)', () => {
  it('tells the waiting version to take over, then reloads when it does', async () => {
    const { container, worker, registration, reload } = fakes();
    const done = applyUpdate({ getRegistration: async () => registration, container, reload });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('also reloads when the new version reports it is active', async () => {
    const { container, worker, registration, reload } = fakes();
    const done = applyUpdate({ getRegistration: async () => registration, container, reload });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway when the phone never says the new version took over (iPhone Home Screen app)', async () => {
    vi.useFakeTimers();
    const { container, worker, registration, reload } = fakes();
    const done = applyUpdate({ getRegistration: async () => registration, container, reload, timeoutMs: 3000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.postMessage).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('just reloads when nothing is waiting, or the registration can’t be read', async () => {
    const reload = vi.fn();
    await applyUpdate({ getRegistration: async () => undefined, container: new EventTarget(), reload });
    await applyUpdate({
      getRegistration: () => Promise.reject(new Error('no service worker')),
      container: new EventTarget(),
      reload,
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
