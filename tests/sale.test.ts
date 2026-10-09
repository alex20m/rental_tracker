import { describe, expect, it } from 'vitest';
import { computeSale, depreciationClaimed, ownedFullYears, suggestedSale } from '@/lib/domain/sale';
import { defaultSettings, type AcquisitionCost, type ApartmentSettings, type SaleDetails, type SaleLedger } from '@/lib/domain/types';

const extra = (kind: AcquisitionCost['kind'], amount: number): AcquisitionCost => ({
  id: `a-${kind}-${amount}`,
  date: '2020-06-01',
  kind,
  description: '',
  amount,
});

const ledger = (settings: Partial<ApartmentSettings> = {}, acquisitionCosts: AcquisitionCost[] = []): SaleLedger => ({
  settings: { ...defaultSettings, ...settings },
  acquisitionCosts,
  rents: [],
  costs: [],
});

/** Bought in March 2018 for 100 000 €, sold in June 2025 for 160 000 €. */
const sale = (over: Partial<SaleDetails> = {}): SaleDetails => ({
  purchaseDate: '2018-03-01',
  purchasePrice: 100000,
  saleDate: '2025-06-15',
  salePrice: 160000,
  saleCosts: 0,
  ...over,
});

const own = { sharePct: 100, otherCapitalIncome: 0, livedIn: false };

describe('the gain of a sale', () => {
  it('is nothing to calculate until a sale date and a price are set', () => {
    expect(computeSale(ledger(), sale({ saleDate: '' }), own)).toBeNull();
    expect(computeSale(ledger(), sale({ salePrice: 0 }), own)).toBeNull();
  });

  it("subtracts the price, every acquisition cost and the selling costs from the selling price, as vero.fi's example does", () => {
    // Verohallinto's example: 100 000 − 70 000 − 10 000 − 1 000 = 19 000.
    const r = computeSale(
      ledger({}, [extra('improvement', 10000)]),
      sale({ purchasePrice: 70000, salePrice: 100000, saleCosts: 1000, purchaseDate: '2023-01-01', saleDate: '2025-01-01' }),
      own,
    )!;
    expect(r.actual.gain).toBe(19000);
    expect(r.actual.costs).toBe(81000);
  });

  it('sums the listed acquisition costs kind by kind', () => {
    const r = computeSale(
      ledger({}, [extra('transfer_tax', 1822.5), extra('inspection', 300), extra('inspection', 120), extra('funded_charge', 4000)]),
      sale(),
      own,
    )!;
    expect(r.actual.byKind).toEqual({ transfer_tax: 1822.5, inspection: 420, funded_charge: 4000 });
    expect(r.actual.costs).toBe(100000 + 1822.5 + 420 + 4000);
    expect(r.actual.gain).toBe(160000 - 106242.5);
  });

  it('is the owner’s own part as entered, whatever share of the apartment they own', () => {
    const r = computeSale(ledger(), sale({ salePrice: 80000, purchasePrice: 50000 }), { ...own, sharePct: 25 })!;
    expect(r.actual.gain).toBe(30000);
    expect(r.gain).toBe(30000);
  });

  it('assumes 20 % of the selling price when the seller has owned the flat under ten years', () => {
    const r = computeSale(ledger(), sale({ purchaseDate: '2016-06-16' }), own)!;
    expect(r.ownedYears).toBe(8);
    expect(r.assumed).toEqual({ rate: 0.2, amount: 32000, gain: 128000 });
  });

  it('assumes 40 % from the tenth anniversary of the purchase, and not the day before', () => {
    expect(computeSale(ledger(), sale({ purchaseDate: '2015-06-15' }), own)!.assumed.rate).toBe(0.4);
    expect(computeSale(ledger(), sale({ purchaseDate: '2015-06-16' }), own)!.assumed.rate).toBe(0.2);
  });

  it('falls back to 20 % when the purchase date is not known, and says the years are unknown', () => {
    const r = computeSale(ledger(), sale({ purchaseDate: '' }), own)!;
    expect(r.ownedYears).toBeNull();
    expect(r.assumed.rate).toBe(0.2);
  });

  it('picks the actual costs for Jaana, whose real costs beat 40 % of the price', () => {
    // Bought for 50 000, 4 000 of other costs, sold for 80 000 after more than 10 years.
    const r = computeSale(ledger({}, [extra('other', 4000)]), sale({ purchasePrice: 50000, salePrice: 80000, purchaseDate: '2012-05-01', saleDate: '2025-05-01' }), own)!;
    expect(r.actual.gain).toBe(26000);
    expect(r.assumed.gain).toBe(48000);
    expect(r.best).toBe('actual');
    expect(r.gain).toBe(26000);
    expect(r.tax).toBe(7800);
  });

  it('picks the assumed cost when the real costs are small or unknown', () => {
    const r = computeSale(ledger(), sale({ purchasePrice: 0, purchaseDate: '2010-01-01', saleDate: '2025-01-01' }), own)!;
    expect(r.actual.gain).toBe(160000);
    expect(r.assumed.gain).toBe(96000);
    expect(r.best).toBe('assumed');
    expect(r.gain).toBe(96000);
  });

  it('prefers the actual costs when both methods give the same gain, because they are the documented ones', () => {
    const r = computeSale(ledger(), sale({ purchasePrice: 20000, salePrice: 100000, purchaseDate: '2024-01-01', saleDate: '2025-01-01' }), own)!;
    expect(r.actual.gain).toBe(r.assumed.gain);
    expect(r.best).toBe('actual');
  });

  it('takes the owner’s share of the building depreciation already deducted off a property’s cost', () => {
    // A 50 000 € building depreciated 2022–2024 at 4 %: 2 000 + 1 920 + 1 843,20 = 5 763,20 for the apartment, 40 % of it theirs.
    const r = computeSale(
      ledger({ propertyType: 'property', useDepreciation: true, purchasePrice: 100000, buildingSharePct: 50, depreciationRate: 4, depreciationFromYear: 2022 }),
      sale({ purchasePrice: 40000 }),
      { ...own, sharePct: 40 },
    )!;
    expect(r.actual.depreciation).toBe(2305.28);
    expect(r.actual.costs).toBe(40000 - 2305.28);
    expect(r.actual.gain).toBe(160000 - 40000 + 2305.28);
  });
});

describe('the tax on the gain', () => {
  const longOwned = { purchasePrice: 0, salePrice: 80000, purchaseDate: '2012-01-01', saleDate: '2025-03-01' };

  it('is 30 % up to 30 000 € and 34 % above, on the Tax Administration’s example of 48 000 €', () => {
    const r = computeSale(ledger(), sale(longOwned), own)!;
    expect(r.best).toBe('assumed');
    expect(r.year).toBe(2025);
    expect(r.gain).toBe(48000);
    expect(r.tax).toBe(15120);
  });

  it('counts the other capital income of the year, so it only raises the part above the limit', () => {
    // 20 000 € of other capital income leaves 10 000 € at 30 % and 38 000 € at 34 %.
    expect(computeSale(ledger(), sale(longOwned), { ...own, otherCapitalIncome: 20000 })!.tax).toBe(15920);
    expect(computeSale(ledger(), sale(longOwned), { ...own, otherCapitalIncome: 50000 })!.tax).toBe(16320);
  });

  it('is nothing for a loss, and says how much the loss was', () => {
    const r = computeSale(ledger(), sale({ purchasePrice: 200000, salePrice: 150000, purchaseDate: '2022-01-01', saleDate: '2025-01-01' }), own)!;
    expect(r.actual.gain).toBe(-50000);
    expect(r.best).toBe('actual');
    expect(r.tax).toBe(0);
    expect(r.loss).toBe(50000);
    expect(r.lossDeductible).toBe(true);
  });

  it('is nothing for the sale of a home lived in for two years and owned for two, and its loss cannot be deducted', () => {
    const sold = { purchaseDate: '2023-06-15', saleDate: '2025-06-15' };
    const gain = computeSale(ledger(), sale(sold), { ...own, livedIn: true })!;
    expect(gain.taxFree).toBe(true);
    expect(gain.tax).toBe(0);

    const loss = computeSale(ledger(), sale({ ...sold, purchasePrice: 200000, salePrice: 150000 }), { ...own, livedIn: true })!;
    expect(loss.loss).toBe(50000);
    expect(loss.lossDeductible).toBe(false);
  });

  it('is not tax-free when owned a day under two years, or when not lived in, or when the purchase date is unknown', () => {
    expect(computeSale(ledger(), sale({ purchaseDate: '2023-06-16' }), { ...own, livedIn: true })!.taxFree).toBe(false);
    expect(computeSale(ledger(), sale({ purchaseDate: '2020-01-01' }), own)!.taxFree).toBe(false);
    expect(computeSale(ledger(), sale({ purchaseDate: '' }), { ...own, livedIn: true })!.taxFree).toBe(false);
  });
});

describe('owned full years', () => {
  it('counts whole years between two dates', () => {
    expect(ownedFullYears('2015-06-15', '2025-06-15')).toBe(10);
    expect(ownedFullYears('2015-06-16', '2025-06-15')).toBe(9);
    expect(ownedFullYears('2016-02-29', '2025-02-28')).toBe(8);
    expect(ownedFullYears('2025-06-15', '2025-06-15')).toBe(0);
    expect(ownedFullYears('2025-06-16', '2025-06-15')).toBe(0);
  });
});

describe('the building depreciation already deducted', () => {
  const property = (extra: Partial<ApartmentSettings> = {}) =>
    ledger({ propertyType: 'property', useDepreciation: true, purchasePrice: 100000, buildingSharePct: 50, depreciationRate: 4, depreciationFromYear: 2022, ...extra });

  it('is the years from the first up to the year before the sale, at the rate chosen, for the whole apartment', () => {
    expect(depreciationClaimed(property(), 2025)).toBe(5763.2);
  });

  it('adds what was deducted before the app started counting', () => {
    // 1 000 € before, then 4 % of 49 000, of 47 040 and of 45 158,40.
    expect(depreciationClaimed(property({ depreciationPrior: 1000 }), 2025)).toBe(6647.94);
  });

  it('is nothing for a share in a housing company, which is never depreciated, or when depreciation is off', () => {
    expect(depreciationClaimed(property({ propertyType: 'share' }), 2025)).toBe(0);
    expect(depreciationClaimed(property({ useDepreciation: false }), 2025)).toBe(0);
  });

  it('is nothing when the first year is the year of the sale', () => {
    expect(depreciationClaimed(property({ depreciationFromYear: 2025 }), 2025)).toBe(0);
  });
});

describe('what a sale starts from', () => {
  it('suggests the owner’s part of the apartment’s purchase price and its date, and no sale', () => {
    expect(suggestedSale({ ...defaultSettings, purchaseDate: '2018-03-01', purchasePrice: 185001 }, 33.33)).toEqual({
      purchaseDate: '2018-03-01',
      purchasePrice: 61660.83, // 33,33 % of 185 001 = 61 660,8333
      saleDate: '',
      salePrice: 0,
      saleCosts: 0,
    });
  });
});
