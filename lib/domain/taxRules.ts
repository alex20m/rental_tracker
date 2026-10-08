/**
 * Every number the law or the Tax Administration sets, in one place.
 *
 * Nothing else in the app writes one of these amounts or rates out: the domain
 * code, the screens and the PDF all read them from here, by tax year. When a
 * rule changes for a new tax year, add one entry to `RULES` (spread the year
 * before it and override what changed), and say in docs/finnish-rental-tax-rules.md
 * where the new figure comes from.
 *
 * Each rule set applies from its own year until a later one replaces it. A tax
 * year before the first entry uses the first. Verified 2026-10-04 against
 * vero.fi, Verohallinto's detailed guidance on rental income (given 12.1.2026)
 * and Finlex — see docs/finnish-rental-tax-rules.md for every source.
 */

export interface TaxRules {
  /** Tax on capital income, which is what rental income is: `lowRate` up to `limit` €, `highRate` above (ISkL 124 b §). */
  capitalIncome: { lowRate: number; highRate: number; limit: number };
  /**
   * The deficit credit (alijäämähyvitys, ISkL 131 §): `rate` of the year's
   * capital-income deficit, at most `max` €, plus `childIncrease` € for one
   * minor child and twice that for two or more. What the credit cannot take
   * stays a loss that is set against capital income for `carryForwardYears`.
   */
  deficitCredit: { rate: number; max: number; childIncrease: number; carryForwardYears: number };
  /** The highest yearly depreciation of a building, in percent of its remaining cost (ISkL 114 §, NärSkL). */
  buildingRate: { residential: number; commercial: number };
  /**
   * Furniture, appliances and other loose property: up to `atOnceLimit` € (or
   * lasting under `minLifeYears`) is deducted at once; dearer is depreciated by
   * `rate` of its remaining cost a year, and a remainder of at most
   * `atOnceLimit` € at the start of a year is deducted whole. A building's
   * remainder follows the same limit.
   */
  movable: { atOnceLimit: number; rate: number; minLifeYears: number };
  /** A basic improvement of a flat is deducted in equal parts over its useful life: at least `minYears`, at most `maxYears` (NärSkL 24 §). */
  improvement: { minYears: number; maxYears: number };
  /** The flat-rate deduction for a furnished flat, € per month it is let. */
  furnishedFlatRate: { studio: number; larger: number };
  /** The deduction for a trip in one's own car, € per kilometre. */
  mileagePerKm: number;
  /**
   * The source tax an owner living abroad pays on wages and other earned
   * income from Finland. It is *not* charged on rent, which is taxed at the
   * capital income rates whatever the owner's country; it is here so the
   * explanation of that says the right number.
   */
  sourceTaxOnEarnedIncome: number;
  /**
   * Selling a home or flat (luovutusvoitto, TVL 45–50 §), taxed as capital
   * income at `capitalIncome`'s rates in the year the sale was agreed. Instead
   * of the actual costs the seller may deduct the assumed acquisition cost
   * (hankintameno-olettama): `assumedShort` of the selling price, or
   * `assumedLong` once the seller has owned it at least `assumedLongYears`
   * years. It replaces the price and every cost of buying and selling, and the
   * Tax Administration uses whichever is better for the seller. A sale of the
   * seller's own permanent home is tax-free after `taxFreeYears` of owning it
   * and living in it; a loss is set against other capital income for
   * `lossCarryForwardYears` more years.
   */
  sale: {
    assumedShort: number;
    assumedLong: number;
    assumedLongYears: number;
    taxFreeYears: number;
    lossCarryForwardYears: number;
  };
  /** Years notes and receipts for the rental income are kept (from the start of the year after taxation is final, the longer of the two readings). */
  recordKeepingYears: number;
}

const RULES_2025: TaxRules = {
  capitalIncome: { lowRate: 0.3, highRate: 0.34, limit: 30000 },
  deficitCredit: { rate: 0.3, max: 1400, childIncrease: 400, carryForwardYears: 10 },
  buildingRate: { residential: 4, commercial: 7 },
  movable: { atOnceLimit: 1200, rate: 0.25, minLifeYears: 3 },
  improvement: { minYears: 3, maxYears: 10 },
  furnishedFlatRate: { studio: 40, larger: 60 },
  mileagePerKm: 0.27,
  sourceTaxOnEarnedIncome: 0.35,
  sale: { assumedShort: 0.2, assumedLong: 0.4, assumedLongYears: 10, taxFreeYears: 2, lossCarryForwardYears: 5 },
  recordKeepingYears: 6,
};

/**
 * Tax year 2026 (the return filed in spring 2027): no change in the rates or
 * the credit (vero.fi, changes in taxation 2026). The kilometre rate is
 * **assumed**: Verohallinto had not published its decision for 2026 when this
 * was checked, and the 2025 decision is valid "until further notice". The
 * 0.55 €/km that is quoted for 2026 is what an employer may pay tax-free, not
 * a landlord's deduction.
 */
const RULES_2026: TaxRules = { ...RULES_2025 };

/** By the first tax year each rule set applies to, oldest first. */
export const RULES: readonly (readonly [year: number, rules: TaxRules])[] = [
  [2025, RULES_2025],
  [2026, RULES_2026],
];

/** The rules for a tax year: the latest set that starts no later than it. */
export function rulesFor(year: number): TaxRules {
  let found = RULES[0]![1];
  for (const [from, rules] of RULES) if (from <= year) found = rules;
  return found;
}

/** The year the newest rule set starts, for screens that have no tax year to hand. */
export const LATEST_RULES_YEAR = RULES[RULES.length - 1]![0];
