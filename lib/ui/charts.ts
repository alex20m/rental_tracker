/**
 * Where the investment page's marks go, as percentages of their chart, so the
 * page only has to place them. Pure arithmetic, tested on its own: a bar in the
 * wrong place is a wrong number told in a picture. The charts are kept plain
 * on purpose: the page is for a landlord, not an analyst.
 */

/** Maps values onto 0–100 from the lowest to the highest, zero always on the scale; flat when all are zero. */
function scale(values: number[]) {
  const lo = Math.min(0, ...values);
  const span = Math.max(0, ...values) - lo || 1;
  return (v: number) => ((v - lo) / span) * 100;
}

/** Each value's length in percent of the largest: bars that share one scale and start from zero. */
export function shareOfLargest(values: number[]): number[] {
  const largest = Math.max(0, ...values) || 1;
  return values.map((v) => (v / largest) * 100);
}

/** A column, in percent of the chart's height. */
export interface Bar {
  bottom: number;
  height: number;
  /** Below the zero line: its rounded end is at the bottom. */
  down: boolean;
}

/** Columns for the values on one scale, zero always on it: a positive one stands on zero, a negative one hangs from it. */
export function columnChart(values: number[]): { zero: number; bars: Bar[] } {
  const at = scale(values);
  return {
    zero: at(0),
    bars: values.map((v) => ({ bottom: at(Math.min(0, v)), height: at(Math.max(0, v)) - at(Math.min(0, v)), down: v < 0 })),
  };
}
