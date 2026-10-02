export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  placement: 'below' | 'above';
}

/**
 * Where to put a popover so it stays on screen: centred under its anchor,
 * pushed back inside the viewport horizontally, and flipped above the anchor
 * when there is no room below. Coordinates are for `position: fixed`.
 */
export function placePopover(
  anchor: Box,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
  margin = 12,
  gap = 8,
): Placement {
  const width = Math.min(size.width, viewport.width - margin * 2);
  const centre = (anchor.left + anchor.right) / 2;
  const left = Math.max(margin, Math.min(centre - width / 2, viewport.width - margin - width));
  const fitsBelow = anchor.bottom + gap + size.height <= viewport.height - margin;
  return fitsBelow
    ? { left, top: anchor.bottom + gap, width, placement: 'below' }
    : { left, top: anchor.top - gap - size.height, width, placement: 'above' };
}
