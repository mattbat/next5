import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { DEFAULT_POSITIONS } from '../data/defaults';
import type { Game } from '../data/types';
import { useWakeLock } from '../hooks/useWakeLock';
import { PositionChip, PositionChips, PositionCounts } from './ui';

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
});

describe('position chips (D1)', () => {
  it('shows a letter, reads the full name, and lists positions in the team order', () => {
    const { container } = render(
      <>
        <PositionChip id="G" positions={DEFAULT_POSITIONS} tone="in" />
        <PositionChip id={null} positions={DEFAULT_POSITIONS} />
        <PositionChips skills={{ C: 1, G: 3 }} positions={DEFAULT_POSITIONS} highlight="C" />
      </>,
    );
    const chips = [...container.querySelectorAll('.pos')];
    expect(chips.map((c) => c.getAttribute('data-position'))).toEqual(['G', 'G', 'C']);
    expect(chips[0]!.querySelector('.chip.in')).toHaveTextContent('G');
    expect(chips[0]).toHaveTextContent('GGuard');
    expect(chips[0]!.querySelector('.chip')).toHaveAttribute('aria-hidden');
    expect(chips[2]!.querySelector('.chip.match')).toHaveTextContent('C');
  });

  it('shows segments by position, or a dash when there are none', () => {
    const { container, rerender } = render(<PositionCounts byPosition={{ C: 2, G: 1 }} positions={DEFAULT_POSITIONS} />);
    expect([...container.querySelectorAll('.pos-count')].map((c) => c.textContent)).toEqual(['GGuard 1', 'CCenter 2']);
    rerender(<PositionCounts byPosition={{}} positions={DEFAULT_POSITIONS} />);
    expect(container).toHaveTextContent('–');
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

  it('stays hidden on the screens of a game in progress, and follows navigation', async () => {
    await db.games.clear();
    await db.games.add({ id: 'g1', teamId: 't1', status: 'live' } as Game);
    await db.games.add({ id: 'g2', teamId: 't1', status: 'final' } as Game);
    const goTo = (hash: string) =>
      act(async () => {
        window.location.hash = hash;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    render(<UpdateBanner />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    for (const hash of ['#/game/g1/live', '#/game/g1/plan', '#/game/g1']) {
      await goTo(hash);
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    }
    // A finished game, or leaving the live game, shows it again.
    await goTo('#/game/g2/live');
    expect(await screen.findByRole('status')).toBeInTheDocument();
    await goTo('#/game/g1/live');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    await goTo('#/');
    expect(await screen.findByRole('status')).toBeInTheDocument();
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

  it('does nothing when the browser has no wake lock, and says the phone may lock', () => {
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    expect(result.current).toEqual({ held: false, failed: true });
    rerender({ on: false });
    expect(result.current).toEqual({ held: false, failed: false });
  });

  it('holds the lock while active and releases it afterwards', async () => {
    const { request, sentinel } = fakeWakeLock();
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current).toEqual({ held: true, failed: false });

    // iOS drops the lock when the app is hidden; it's requested again on return.
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);

    rerender({ on: false });
    await act(async () => {});
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('reports a refused request, so the screen can warn', async () => {
    const request = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(result.current).toEqual({ held: false, failed: true });
  });
});
