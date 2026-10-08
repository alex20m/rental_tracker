import { depreciationDetail, depreciationStartYear, estimateCapitalTax, round2 } from './tax';
import { rulesFor } from './taxRules';
import type { AcquisitionKind, Ledger, SaleLedger } from './types';

// The rates, shares and years the law sets live in ./taxRules (`sale`, `capitalIncome`).

/** What the viewer tells the sale calculation about themselves; none of it is stored. */
export interface SaleOptions {
  /** The viewer's ownership share of the apartment, in percent. */
  sharePct: number;
  /** The viewer's other capital income in the sale year (rent, interest, gains), which decides where the 34 % rate begins. */
  otherCapitalIncome: number;
  /** Whether the viewer, or their family, lived in it as their permanent home for at least the tax-free period. */
  livedIn: boolean;
}

/** Selling the whole apartment with the actual costs. */
export interface ActualCosts {
  purchasePrice: number;
  /** `purchaseCosts` of the settings: the costs of buying, as entered there. */
  purchaseCosts: number;
  /** The listed acquisition costs, summed by kind; kinds with none are left out. */
  byKind: Partial<Record<AcquisitionKind, number>>;
  /** The building depreciation already deducted, which the cost does not include twice. */
  depreciation: number;
  saleCosts: number;
  /** Everything deducted from the selling price. */
  costs: number;
  gain: number;
}

/** Selling the whole apartment with the assumed acquisition cost (hankintameno-olettama). */
export interface AssumedCost {
  rate: number;
  amount: number;
  gain: number;
}

export interface SaleResult {
  /** The tax year of the sale, which decides the rates. */
  year: number;
  /** Whole years from the purchase to the sale; null when the purchase date is not known. */
  ownedYears: number | null;
  actual: ActualCosts;
  assumed: AssumedCost;
  /** The method that gives the smaller gain; the actual costs when they are equal, as the documented one. */
  best: 'actual' | 'assumed';
  /** The whole apartment's gain by `best` (negative: a loss). */
  gain: number;
  /** The viewer's part of `gain`. */
  myGain: number;
  /** The viewer's part of a loss, as a positive amount; 0 for a gain. */
  loss: number;
  /** Whether a loss can be set against other capital income. Not when the gain would have been tax-free. */
  lossDeductible: boolean;
  taxFree: boolean;
  /** The tax the viewer's part of the gain adds on top of their other capital income. */
  tax: number;
}

/** Whole years from one date to another, YYYY-MM-DD; never negative. */
export function ownedFullYears(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const years = y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
  return Math.max(years, 0);
}

/**
 * The building depreciation a property's owner has deducted by the start of
 * the sale year (the sale year's own is not counted): it is taken off the
 * acquisition cost, so the same euro is not deducted twice. Never for a share
 * in a housing company, whose price is not depreciated.
 */
export function depreciationClaimed(ledger: Ledger, saleYear: number): number {
  const s = ledger.settings;
  if (s.propertyType !== 'property' || !s.useDepreciation) return 0;
  let total = s.depreciationPrior;
  for (let y = depreciationStartYear(ledger, saleYear); y < saleYear; y++) {
    total += depreciationDetail(ledger, y)?.part ?? 0;
  }
  return round2(total);
}

/**
 * The gain from selling the apartment, by the two ways the Tax Administration
 * allows — actual costs, or the assumed acquisition cost — and the viewer's
 * tax on the better one (ISkL TVL 45–50 §; see docs/finnish-rental-tax-rules.md).
 * Null until a sale date and price are set.
 */
export function computeSale(ledger: SaleLedger, options: SaleOptions): SaleResult | null {
  const s = ledger.settings;
  if (s.saleDate === '' || s.salePrice <= 0) return null;

  const year = Number(s.saleDate.slice(0, 4));
  const rules = rulesFor(year);
  const ownedYears = s.purchaseDate === '' ? null : ownedFullYears(s.purchaseDate, s.saleDate);

  const byKind: Partial<Record<AcquisitionKind, number>> = {};
  for (const c of ledger.acquisitionCosts) byKind[c.kind] = round2((byKind[c.kind] ?? 0) + c.amount);
  const listed = round2(Object.values(byKind).reduce((a, n) => a + n, 0));
  const depreciation = depreciationClaimed(ledger, year);
  const costs = round2(s.purchasePrice + s.purchaseCosts + listed - depreciation + s.saleCosts);
  const actual: ActualCosts = {
    purchasePrice: s.purchasePrice,
    purchaseCosts: s.purchaseCosts,
    byKind,
    depreciation,
    saleCosts: s.saleCosts,
    costs,
    gain: round2(s.salePrice - costs),
  };

  const rate = ownedYears !== null && ownedYears >= rules.sale.assumedLongYears ? rules.sale.assumedLong : rules.sale.assumedShort;
  const amount = round2(s.salePrice * rate);
  const assumed: AssumedCost = { rate, amount, gain: round2(s.salePrice - amount) };

  const best = assumed.gain < actual.gain ? 'assumed' : 'actual';
  const gain = best === 'assumed' ? assumed.gain : actual.gain;
  const myGain = round2((gain * options.sharePct) / 100);
  const taxFree = ownedYears !== null && ownedYears >= rules.sale.taxFreeYears && options.livedIn;
  const tax =
    taxFree || myGain <= 0
      ? 0
      : round2(
          estimateCapitalTax(options.otherCapitalIncome + myGain, year) - estimateCapitalTax(options.otherCapitalIncome, year),
        );

  return {
    year,
    ownedYears,
    actual,
    assumed,
    best,
    gain,
    myGain,
    loss: myGain < 0 ? -myGain : 0,
    lossDeductible: !taxFree,
    taxFree,
    tax,
  };
}
