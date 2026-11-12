/**
 * Beeps for the practice timer (PR7). iPhone Safari only plays sound after
 * a tap, so `unlock()` runs on the run screen's first tap. iPhones don't
 * vibrate for web apps; phones that can, also vibrate.
 */

const SOUND_KEY = 'next5.practiceSound';

let context: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered; it still applies now.
  }
}

/** Prepares sound; call from a tap. */
export function unlock(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    context ??= new Ctx();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

/** One short beep, or `count` of them. */
export function beep(count = 1): void {
  if (!soundOn()) return;
  try {
    navigator.vibrate?.(count === 1 ? 200 : [200, 120, 200, 120, 400]);
  } catch {
    // No vibration.
  }
  if (!context) return;
  try {
    for (let i = 0; i < count; i++) {
      const at = context.currentTime + i * 0.3;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = i === count - 1 && count > 1 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + 0.25);
    }
  } catch {
    // Sound unavailable.
  }
}
