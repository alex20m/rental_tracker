import { depreciationDetail, depreciationStartYear, estimateCapitalTax, round2 } from './tax';
import { rulesFor } from './taxRules';
import type { AcquisitionKind, ApartmentSettings, Ledger, SaleDetails, SaleLedger } from './types';

// The rates, shares and years the law sets live in ./taxRules (`sale`, `capitalIncome`).

/** What the sale calculation needs besides the owner's own figures; the last two are not stored. */
export interface SaleOptions {
  /** The owner's share of the apartment, in percent: their part of the apartment's building depreciation. */
  sharePct: number;
  /** The viewer's other capital income in the sale year (rent, interest, gains), which decides where the 34 % rate begins. */
  otherCapitalIncome: number;
  /** Whether the viewer, or their family, lived in it as their permanent home for at least the tax-free period. */
  livedIn: boolean;
}

/** Selling the owner's part with the actual costs. */
export interface ActualCosts {
  purchasePrice: number;
  /** The listed acquisition costs, summed by kind; kinds with none are left out. */
  byKind: Partial<Record<AcquisitionKind, number>>;
  /** The owner's part of the building depreciation already deducted, which the cost does not include twice. */
  depreciation: number;
  saleCosts: number;
  /** Everything deducted from the selling price. */
  costs: number;
  gain: number;
}

/** Selling the owner's part with the assumed acquisition cost (hankintameno-olettama). */
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
  /** The owner's gain by `best` (negative: a loss). */
  gain: number;
  /** The loss as a positive amount; 0 for a gain. */
  loss: number;
  /** Whether a loss can be set against other capital income. Not when the gain would have been tax-free. */
  lossDeductible: boolean;
  taxFree: boolean;
  /** The tax the gain adds on top of the owner's other capital income. */
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
 * What a sale starts from before the owner has entered one: their part of the
 * apartment's purchase price and its date, to be changed to what they paid.
 */
export function suggestedSale(settings: ApartmentSettings, sharePct: number): SaleDetails {
  return {
    purchaseDate: settings.purchaseDate,
    purchasePrice: round2((settings.purchasePrice * sharePct) / 100),
    saleDate: '',
    salePrice: 0,
    saleCosts: 0,
  };
}

/**
 * The owner's gain from selling their part of the apartment, by the two ways
 * the Tax Administration allows — actual costs, or the assumed acquisition cost
 * — and their tax on the better one (TVL 45–50 §; see
 * docs/finnish-rental-tax-rules.md). Every amount in `sale` and in the
 * acquisition costs is the owner's own part. Null until a sale date and price
 * are set.
 */
export function computeSale(ledger: SaleLedger, sale: SaleDetails, options: SaleOptions): SaleResult | null {
  if (sale.saleDate === '' || sale.salePrice <= 0) return null;

  const year = Number(sale.saleDate.slice(0, 4));
  const rules = rulesFor(year);
  const ownedYears = sale.purchaseDate === '' ? null : ownedFullYears(sale.purchaseDate, sale.saleDate);

  const byKind: Partial<Record<AcquisitionKind, number>> = {};
  for (const c of ledger.acquisitionCosts) byKind[c.kind] = round2((byKind[c.kind] ?? 0) + c.amount);
  const listed = round2(Object.values(byKind).reduce((a, n) => a + n, 0));
  const depreciation = round2((depreciationClaimed(ledger, year) * options.sharePct) / 100);
  const costs = round2(sale.purchasePrice + listed - depreciation + sale.saleCosts);
  const actual: ActualCosts = {
    purchasePrice: sale.purchasePrice,
    byKind,
    depreciation,
    saleCosts: sale.saleCosts,
    costs,
    gain: round2(sale.salePrice - costs),
  };

  const rate = ownedYears !== null && ownedYears >= rules.sale.assumedLongYears ? rules.sale.assumedLong : rules.sale.assumedShort;
  const amount = round2(sale.salePrice * rate);
  const assumed: AssumedCost = { rate, amount, gain: round2(sale.salePrice - amount) };

  const best = assumed.gain < actual.gain ? 'assumed' : 'actual';
  const gain = best === 'assumed' ? assumed.gain : actual.gain;
  const taxFree = ownedYears !== null && ownedYears >= rules.sale.taxFreeYears && options.livedIn;
  const tax =
    taxFree || gain <= 0
      ? 0
      : round2(
          estimateCapitalTax(options.otherCapitalIncome + gain, year) - estimateCapitalTax(options.otherCapitalIncome, year),
        );

  return {
    year,
    ownedYears,
    actual,
    assumed,
    best,
    gain,
    loss: gain < 0 ? -gain : 0,
    lossDeductible: !taxFree,
    taxFree,
    tax,
  };
}
