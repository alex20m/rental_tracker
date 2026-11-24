import type { CashMonth, InvestmentYear } from '@/lib/domain/investment';

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

export type SegmentKey = 'rent' | 'credit' | 'costs' | 'tax' | 'amortization';

/** One part of a bar: what it is, its amount, and its width in percent of the longer bar. */
export interface Segment {
  key: SegmentKey;
  value: number;
  width: number;
}

export interface InOutBar {
  total: number;
  segments: Segment[];
}

/**
 * The year's money in (the rent, and a deficit credit) against its money out
 * (every cost, improvements included, the tax and the loan repayment), as two
 * bars on one scale: the gap between them is what was left on the account.
 */
export function inOutChart(y: InvestmentYear): { in: InOutBar; out: InOutBar } {
  const parts = (list: [SegmentKey, number][]) => list.filter(([, v]) => v > 0);
  const ins = parts([
    ['rent', y.rentIncome],
    ['credit', -y.tax],
  ]);
  const outs = parts([
    ['costs', y.runningCosts + y.investments],
    ['tax', y.tax],
    ['amortization', y.amortization],
  ]);
  const sum = (list: [SegmentKey, number][]) => list.reduce((a, [, v]) => a + v, 0);
  const longest = Math.max(sum(ins), sum(outs)) || 1;
  const bar = (list: [SegmentKey, number][]): InOutBar => ({
    total: sum(list),
    segments: list.map(([key, value]) => ({ key, value, width: (value / longest) * 100 })),
  });
  return { in: bar(ins), out: bar(outs) };
}

/** A point of a line, in percent: `x` across the year, `y` down from the top. */
export interface Point {
  x: number;
  y: number;
}

const coord = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The money on the account through the year: zero on the first of January,
 * then each month's running total at that month's end, a twelfth of the width
 * apart. `line` and `area` are SVG paths in a 100 × 100 box; `zero` is the
 * zero line, down from the top.
 */
export function cumulativeChart(months: CashMonth[]): { zero: number; points: Point[]; line: string; area: string } {
  const at = scale(months.map((m) => m.cumulative));
  const y = (v: number) => 100 - at(v);
  const points = [{ x: 0, y: y(0) }, ...months.map((m) => ({ x: (m.month / 12) * 100, y: y(m.cumulative) }))];
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${coord(p.x)} ${coord(p.y)}`).join('');
  const end = points[points.length - 1]!;
  return { zero: y(0), points, line, area: `${line}L${coord(end.x)} ${coord(y(0))}Z` };
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
