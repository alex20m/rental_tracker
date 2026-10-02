import { describe, expect, it } from 'vitest';
import { placePopover } from '@/lib/ui/popover';

const viewport = { width: 390, height: 800 };
const size = { width: 280, height: 90 };
const anchorAt = (left: number, top: number) => ({ left, right: left + 20, top, bottom: top + 20 });

describe('placing an info popover', () => {
  it('centres the popover under the icon', () => {
    const p = placePopover(anchorAt(180, 100), viewport, size);
    expect(p.placement).toBe('below');
    expect(p.top).toBe(128); // icon bottom (120) + 8px gap
    expect(p.left).toBe(190 - 140); // icon centre (190) − half the width
  });

  it('keeps it inside the left edge when the icon is near it', () => {
    expect(placePopover(anchorAt(4, 100), viewport, size).left).toBe(12);
  });

  it('keeps it inside the right edge when the icon is near it', () => {
    const p = placePopover(anchorAt(370, 100), viewport, size);
    expect(p.left + size.width).toBe(viewport.width - 12);
  });

  it('opens above the icon when there is no room below', () => {
    const p = placePopover(anchorAt(180, 760), viewport, size);
    expect(p.placement).toBe('above');
    expect(p.top).toBe(760 - 8 - 90);
  });

  it('shrinks to fit a viewport narrower than the popover', () => {
    const p = placePopover(anchorAt(100, 100), { width: 200, height: 800 }, size);
    expect(p.width).toBe(176); // 200 − 2 × 12
    expect(p.left).toBe(12);
  });
});
