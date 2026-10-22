// External store so pointer moves re-render only the crosshair overlay, not Timeline.
export type PointerState = {
  x: number | null;
  // Live view position, which can be ahead of Timeline's committed state during a drag.
  position: number;
};

let state: PointerState = { x: null, position: 0 };
const listeners = new Set<() => void>();

export const pointerStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  set(patch: Partial<PointerState>) {
    const next = { ...state, ...patch };
    if (next.x === state.x && next.position === state.position) return;
    state = next;
    listeners.forEach((listener) => listener());
  },
};
