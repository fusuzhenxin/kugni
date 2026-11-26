// Popovers use layout pixels; DOM rectangles use pixels after the root CSS zoom.
export function layoutViewport(element: HTMLElement) {
  const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
  const bounds = element.getBoundingClientRect();
  return {
    zoom,
    width: innerWidth / zoom,
    height: innerHeight / zoom,
    rect: {
      left: bounds.left / zoom,
      top: bounds.top / zoom,
      bottom: bounds.bottom / zoom,
      width: bounds.width / zoom,
    },
  };
}
