import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../hooks/useWakeLock';

const pwa = vi.hoisted(() => ({ needRefresh: true, update: vi.fn() }));
vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react');
  return {
    useRegisterSW: () => {
      const [needRefresh, setNeedRefresh] = useState(pwa.needRefresh);
      return { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker: pwa.update };
    },
  };
});

const { UpdateBanner } = await import('./UpdateBanner');
const { ErrorBanner } = await import('./ErrorBanner');

describe('ErrorBanner', () => {
  it('shows unhandled errors and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<ErrorBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(rejection, { reason: new Error('Storage is full') });
    act(() => {
      window.dispatchEvent(rejection);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Storage is full');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Oops' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Oops');
  });

  it('ignores detail-less errors from other sites’ scripts, e.g. when Safari’s Share sheet opens', () => {
    render(<ErrorBanner />);
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('UpdateBanner', () => {
  afterEach(() => {
    window.location.hash = '';
    pwa.update.mockReset();
  });

  it('offers to update, and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<UpdateBanner />);
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(pwa.update).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays hidden during a live game', () => {
    window.location.hash = '#/game/g1/live';
    render(<UpdateBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('useWakeLock', () => {
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  function fakeWakeLock() {
    const listeners: (() => void)[] = [];
    const sentinel = {
      release: vi.fn(async () => listeners.forEach((l) => l())),
      addEventListener: (_: string, l: () => void) => listeners.push(l),
    };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return { request, sentinel };
  }

  it('does nothing when the browser has no wake lock', () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe(false);
  });

  it('holds the lock while active and releases it afterwards', async () => {
    const { request, sentinel } = fakeWakeLock();
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current).toBe(true);

    // iOS drops the lock when the app is hidden; it's requested again on return.
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);

    rerender({ on: false });
    await act(async () => {});
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('reports false when the request is refused', async () => {
    const request = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});
