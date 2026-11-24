import { describe, expect, it } from 'vitest';
import { columnChart, shareOfLargest } from '@/lib/ui/charts';

describe('bars measured against the largest', () => {
  it('gives each value its length in percent of the largest', () => {
    expect(shareOfLargest([400, 1000, 250, 0])).toEqual([40, 100, 25, 0]);
  });

  it('draws nothing, and divides by nothing, when every value is zero', () => {
    expect(shareOfLargest([0, 0])).toEqual([0, 0]);
  });
});

describe('a column chart', () => {
  it('stands a positive value on the zero line and hangs a negative one below it, on one scale', () => {
    // From −1 000 to 3 000: zero a quarter of the way up.
    expect(columnChart([3000, -1000])).toEqual({
      zero: 25,
      bars: [
        { bottom: 25, height: 75, down: false },
        { bottom: 0, height: 25, down: true },
      ],
    });
  });

  it('has no height to share out when every value is zero', () => {
    expect(columnChart([0])).toEqual({ zero: 0, bars: [{ bottom: 0, height: 0, down: false }] });
  });
});
