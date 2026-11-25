import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { appHeight, blockZoom, containScroll, isStandalone, trackAppHeight } from './viewport';

function setWindow({ inner, screenHeight, standalone }: { inner: [number, number]; screenHeight: number; standalone: boolean }) {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(inner[0]);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(inner[1]);
  vi.spyOn(window.screen, 'height', 'get').mockReturnValue(screenHeight);
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
  document.documentElement.style.removeProperty('--app-height');
});

describe('appHeight', () => {
  it('uses the full screen height in a Home Screen app where iOS reports it short', () => {
    // iPhone 16 Pro: 874pt screen, iOS reports 812 (minus the 62pt status bar).
    setWindow({ inner: [402, 812], screenHeight: 874, standalone: true });
    expect(isStandalone()).toBe(true);
    expect(appHeight()).toBe(874);
  });

  it('uses the window height in Safari, where toolbars take real space', () => {
    setWindow({ inner: [402, 680], screenHeight: 874, standalone: false });
    expect(isStandalone()).toBe(false);
    expect(appHeight()).toBe(680);
  });

  it('uses the window height in landscape', () => {
    setWindow({ inner: [874, 402], screenHeight: 874, standalone: true });
    expect(appHeight()).toBe(402);
  });

  it('sets --app-height and keeps it updated on resize', () => {
    setWindow({ inner: [402, 812], screenHeight: 874, standalone: true });
    const stop = trackAppHeight();
    expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('874px');
    setWindow({ inner: [402, 700], screenHeight: 874, standalone: false });
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('700px');
    stop();
  });
});

describe('blockZoom', () => {
  function touchMove(fingers: number): Event {
    const e = new Event('touchmove', { cancelable: true });
    Object.defineProperty(e, 'touches', { value: { length: fingers } });
    return e;
  }

  it('cancels pinch gestures and two-finger moves but not one-finger scrolling', () => {
    const stop = blockZoom();
    const pinch = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);

    const twoFingers = touchMove(2);
    document.dispatchEvent(twoFingers);
    expect(twoFingers.defaultPrevented).toBe(true);

    const oneFinger = touchMove(1);
    document.dispatchEvent(oneFinger);
    expect(oneFinger.defaultPrevented).toBe(false);

    stop();
    const after = new Event('gesturechange', { cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe('DiagnosticsScreen', () => {
  it('lists what the device reports, including the build time', () => {
    setWindow({ inner: [402, 812], screenHeight: 874, standalone: true });
    render(<DiagnosticsScreen />);
    expect(screen.getByText('Running as app (Home Screen)').nextSibling).toHaveTextContent('yes');
    expect(screen.getByText('App height used').nextSibling).toHaveTextContent('874');
    expect(screen.getByText('Build').nextSibling).toHaveTextContent(/UTC/);
    window.dispatchEvent(new Event('resize'));
    expect(screen.getByText('Safe areas (top / right / bottom / left)')).toBeInTheDocument();
  });
});

describe('containScroll', () => {
  function sheet({ scrollTop, clientHeight, scrollHeight }: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight });
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
    return el;
  }
  function touch(el: HTMLElement, type: 'touchstart' | 'touchmove', x: number, y: number): Event {
    const e = new Event(type, { cancelable: true });
    Object.defineProperty(e, 'touches', { value: [{ clientX: x, clientY: y }] });
    el.dispatchEvent(e);
    return e;
  }
  /** Whether a swipe from y=300 to `toY` would reach the page behind. */
  function swipe(el: HTMLElement, toY: number, toX = 100): boolean {
    touch(el, 'touchstart', 100, 300);
    return touch(el, 'touchmove', toX, toY).defaultPrevented;
  }

  it('cancels swipes on a sheet that fits, so the page behind stays put', () => {
    const el = sheet({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 });
    const stop = containScroll(el);
    expect(swipe(el, 200)).toBe(true);
    expect(swipe(el, 400)).toBe(true);
    stop();
    expect(swipe(el, 200)).toBe(false);
  });

  it('lets a long sheet scroll, cancelling only past its top and bottom', () => {
    const top = sheet({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 });
    containScroll(top);
    expect(swipe(top, 400)).toBe(true); // pulling down at the top
    expect(swipe(top, 200)).toBe(false); // scrolling the sheet down

    const middle = sheet({ scrollTop: 300, clientHeight: 400, scrollHeight: 1000 });
    containScroll(middle);
    expect(swipe(middle, 400)).toBe(false);
    expect(swipe(middle, 200)).toBe(false);

    const bottom = sheet({ scrollTop: 600, clientHeight: 400, scrollHeight: 1000 });
    containScroll(bottom);
    expect(swipe(bottom, 200)).toBe(true); // pushing up at the bottom
    expect(swipe(bottom, 400)).toBe(false);
  });

  it('leaves sideways swipes alone, for a row of filter tags', () => {
    const el = sheet({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 });
    containScroll(el);
    expect(swipe(el, 310, 0)).toBe(false);
  });
});
