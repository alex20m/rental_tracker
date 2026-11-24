import type { InvestmentYear } from '@/lib/domain/investment';

/**
 * Where the investment page's bars go, as percentages of their chart, so the
 * page only has to set a width or a bottom and a height. Pure arithmetic,
 * tested on its own: a bar in the wrong place is a wrong number told in a
 * picture. The charts are kept plain on purpose: the page is for a landlord,
 * not an analyst.
 */

export type SegmentKey = 'rent' | 'credit' | 'costs' | 'tax';

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
 * (every cost, improvements included, and the tax), as two bars on one scale:
 * the gap between them is the profit.
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
  ]);
  const sum = (list: [SegmentKey, number][]) => list.reduce((a, [, v]) => a + v, 0);
  const longest = Math.max(sum(ins), sum(outs)) || 1;
  const bar = (list: [SegmentKey, number][]): InOutBar => ({
    total: sum(list),
    segments: list.map(([key, value]) => ({ key, value, width: (value / longest) * 100 })),
  });
  return { in: bar(ins), out: bar(outs) };
}

/** A year's column: its profit after tax, and where the bar sits in percent of the chart's height. */
export interface ProfitColumn {
  year: number;
  value: number;
  bottom: number;
  height: number;
  /** Below the zero line: its rounded end is at the bottom. */
  down: boolean;
}

/** Each year's profit after tax on one scale, zero always on it. */
export function profitChart(years: InvestmentYear[]): { zero: number; columns: ProfitColumn[] } {
  const values = years.map((y) => y.profitAfterTax);
  const lo = Math.min(0, ...values);
  const span = Math.max(0, ...values) - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;
  return {
    zero: at(0),
    columns: years.map((y) => {
      const v = y.profitAfterTax;
      return { year: y.year, value: v, bottom: at(Math.min(0, v)), height: at(Math.max(0, v)) - at(Math.min(0, v)), down: v < 0 };
    }),
  };
}
