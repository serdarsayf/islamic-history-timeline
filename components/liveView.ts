// Imperative transform targets for panning; kept outside the component so drags skip React renders.
let world: HTMLElement | null = null;
let ticks: HTMLElement | null = null;
let axis: HTMLElement | null = null;

export const setWorldElement = (element: HTMLElement | null) => {
  world = element;
};
export const setTicksElement = (element: HTMLElement | null) => {
  ticks = element;
};
export const setAxisElement = (element: HTMLElement | null) => {
  axis = element;
};

export function applyLiveTransforms(worldX: number, axisY: number, axisShift: number) {
  if (world) world.style.transform = `translate3d(${worldX}px, ${axisY}px, 0)`;
  if (ticks) ticks.style.transform = `translate3d(${worldX}px, ${axisShift}px, 0)`;
  if (axis) axis.style.transform = `translateY(${axisShift}px)`;
}
