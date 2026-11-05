import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { appHeight, blockZoom, isStandalone, trackAppHeight } from './viewport';

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
