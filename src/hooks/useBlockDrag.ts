import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Drag and drop for the practice plan's blocks (PR4), by a handle on each
 * card. Works with a finger or a mouse (pointer events; the handle has
 * touch-action: none so dragging it doesn't scroll the page), and scrolls
 * the page when the finger nears the top or bottom. With a keyboard, the
 * handle's ↑ and ↓ keys move the block one place.
 *
 * Only blocks from `first` on can move or be moved past (while practice is
 * running, the ones still to come).
 */
/** Where to put a block: at a position (a drop), or one place up or down from wherever it is now (a key). */
export type BlockMove = { to: number } | { by: -1 | 1 };

export function useBlockDrag(ids: string[], first: number, onMove: (id: string, move: BlockMove) => void) {
  const count = ids.length;
  const items = useRef(new Map<number, HTMLElement>());
  // A block moved with the keyboard keeps focus on its handle, wherever it lands.
  const refocus = useRef<{ id: string; to: number } | null>(null);
  useEffect(() => {
    const want = refocus.current;
    if (!want || ids[want.to] !== want.id) return;
    refocus.current = null;
    items.current.get(want.to)?.querySelector<HTMLElement>('.drag-handle')?.focus();
  });
  const [drag, setDragState] = useState<{ from: number; over: number; dy: number; height: number } | null>(null);
  // The latest drag, for the drop: a quick lift can come before React re-renders with the last move.
  const latest = useRef<typeof drag>(null);
  const setDrag = (next: typeof drag) => {
    latest.current = next;
    setDragState(next);
  };
  const start = useRef<{ y: number; mids: number[]; tops: number[]; height: number } | null>(null);
  const pointerY = useRef(0);
  const scrollTimer = useRef<number | null>(null);

  const stopScrolling = () => {
    if (scrollTimer.current !== null) window.clearInterval(scrollTimer.current);
    scrollTimer.current = null;
  };
  useEffect(() => stopScrolling, []);

  /** Where the dragged block would land for a page position. */
  const update = (from: number) => {
    const s = start.current;
    if (!s) return;
    const dy = pointerY.current + window.scrollY - s.y;
    const center = s.mids[from]! + dy;
    let over = 0;
    s.mids.forEach((mid, j) => {
      if (j !== from && mid < center) over++;
    });
    over = Math.min(count - 1, Math.max(first, over));
    setDrag({ from, over, dy, height: s.height });
  };

  const handleProps = (index: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (index < first || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const rects = Array.from({ length: count }, (_, j) => items.current.get(j)?.getBoundingClientRect());
      const gap = rects[1] && rects[0] ? rects[1].top - rects[0].bottom : 10;
      start.current = {
        y: e.clientY + window.scrollY,
        mids: rects.map((r) => (r ? r.top + window.scrollY + r.height / 2 : 0)),
        tops: rects.map((r) => (r ? r.top + window.scrollY : 0)),
        height: (rects[index]?.height ?? 0) + gap,
      };
      pointerY.current = e.clientY;
      setDrag({ from: index, over: index, dy: 0, height: start.current.height });
      // Near the top or bottom of the screen, keep scrolling while the finger rests there.
      scrollTimer.current = window.setInterval(() => {
        const y = pointerY.current;
        const edge = 80;
        const by = y < edge ? -12 : y > window.innerHeight - edge ? 12 : 0;
        if (by !== 0) {
          window.scrollBy(0, by);
          update(index);
        }
      }, 30);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      pointerY.current = e.clientY;
      update(index);
    },
    onPointerUp: () => {
      stopScrolling();
      const done = latest.current;
      start.current = null;
      setDrag(null);
      if (done && done.over !== done.from) onMove(ids[done.from]!, { to: done.over });
    },
    onPointerCancel: () => {
      stopScrolling();
      start.current = null;
      setDrag(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : null;
      if (by === null) return;
      e.preventDefault();
      const pending = refocus.current;
      const to = (pending && pending.id === ids[index] ? pending.to : index) + by;
      if (index >= first && to >= first && to < count) {
        refocus.current = { id: ids[index]!, to };
        onMove(ids[index]!, { by });
      }
    },
  });

  /** Moves the dragged card with the finger and slides the others out of its way. */
  const itemStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (index === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 2, position: 'relative' };
    if (drag.from < drag.over && index > drag.from && index <= drag.over) return { transform: `translateY(${-drag.height}px)` };
    if (drag.over < drag.from && index >= drag.over && index < drag.from) return { transform: `translateY(${drag.height}px)` };
    return undefined;
  };

  const register = (index: number) => (el: HTMLElement | null) => {
    if (el) items.current.set(index, el);
    else items.current.delete(index);
  };

  return { handleProps, itemStyle, register, dragging: drag?.from ?? null };
}
