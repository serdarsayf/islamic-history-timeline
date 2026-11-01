// Imperative transform targets for panning and zooming; kept outside the component so they skip React renders.
let world: HTMLElement | null = null;
let ticks: HTMLElement | null = null;
let axis: HTMLElement | null = null;
let lineage: SVGElement | null = null;

export const setWorldElement = (element: HTMLElement | null) => {
  world = element;
};
export const setTicksElement = (element: HTMLElement | null) => {
  ticks = element;
};
export const setAxisElement = (element: HTMLElement | null) => {
  axis = element;
};
export const setLineageElement = (element: SVGElement | null) => {
  lineage = element;
};

type LiveTransforms = {
  worldX: number;
  axisY: number;
  axisShift: number;
  zoom: number;
  // Live zoom over the zoom the lineage routes were computed at.
  lineageScale: number;
};

// `--tz` is read by item and tick sizes, so a zoom change is one style write instead of a React render.
export function applyLiveTransforms({ worldX, axisY, axisShift, zoom, lineageScale }: LiveTransforms) {
  if (world) {
    world.style.transform = `translate3d(${worldX}px, ${axisY}px, 0)`;
    world.style.setProperty("--tz", String(zoom));
  }
  if (ticks) {
    ticks.style.transform = `translate3d(${worldX}px, ${axisShift}px, 0)`;
    ticks.style.setProperty("--tz", String(zoom));
  }
  if (axis) axis.style.transform = `translateY(${axisShift}px)`;
  if (lineage) lineage.style.transform = `scale(${lineageScale})`;
}
