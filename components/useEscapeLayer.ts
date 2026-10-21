import { useEffect, useRef } from "react";

type EscapeLayer = { close: () => void };

const layers: EscapeLayer[] = [];

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || layers.length === 0) return;
  event.preventDefault();
  layers[layers.length - 1].close();
}

// While active, Escape closes this layer; the most recently opened layer closes first.
export function useEscapeLayer(active: boolean, close: () => void) {
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!active) return;

    const layer: EscapeLayer = { close: () => closeRef.current() };
    if (layers.length === 0) window.addEventListener("keydown", handleKeyDown);
    layers.push(layer);

    return () => {
      layers.splice(layers.indexOf(layer), 1);
      if (layers.length === 0) window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active]);
}
