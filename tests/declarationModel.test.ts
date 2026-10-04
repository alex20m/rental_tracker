import { describe, expect, it } from 'vitest';
import { declarationModel, type PdfBlock } from '@/lib/domain/declarationModel';
import { computeTax, ownerShare } from '@/lib/domain/tax';
import { defaultSettings, type ApartmentView, type CostEntry } from '@/lib/domain/types';

/**
 * What the declaration PDF says, before it is drawn: the blocks of text and
 * figures, in the order of the Finnish forms, so the numbers on a form can be
 * copied straight off the page.
 */

const today = new Date('2027-03-10T12:00:00Z');
const cost = (c: Partial<CostEntry> & Pick<CostEntry, 'category' | 'amount' | 'date'>): CostEntry => ({
  id: `${c.category}-${c.date}-${c.amount}`,
  description: '',
  hasReceipt: true,
  ...c,
});
const paid = (month: string, amount = 1000) => ({ month, status: 'paid' as const, amount, receivedDate: `${month}-03`, note: '' });

const apartment = (settings: Partial<ApartmentView['settings']>, costs: CostEntry[], rents = [paid('2025-01'), paid('2025-02')], pct = 100): ApartmentView => ({
  id: '11111111-1111-4111-8111-111111111111',
  settings: { ...defaultSettings, name: 'Kauppakatu 12', address: 'Kauppakatu 12 B 7, Vaasa', ...settings },
  owners: pct === 100 ? [{ userId: 'u', email: 'u@example.test', sharePct: 100 }] : [{ userId: 'u', email: 'u@example.test', sharePct: pct }, { userId: 'v', email: 'v@example.test', sharePct: 100 - pct }],
  invites: [],
  rents,
  costs,
  mySharePct: pct,
});
const model = (apt: ApartmentView, year = 2025) => {
  const t = computeTax(apt, year, today);
  return declarationModel(apt, t, ownerShare(t, apt.mySharePct), 'Aino Aalto');
};
const forms = (blocks: PdfBlock[]) =>
  blocks.flatMap((b) => (b.type === 'form' ? [[b.ref, b.label, b.fi, b.value] as const] : []));
const texts = (blocks: PdfBlock[]) =>
  blocks.flatMap((b) => ('text' in b ? [b.text] : 'left' in b ? [b.left] : 'label' in b ? [b.label] : [])).join('\n');

describe('the declaration for a flat in a housing company', () => {
  const flat = apartment(
    { financingChargeDeductible: true },
    [
      cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 300 }),
      cost({ category: 'financing_charge', date: '2025-02-01', amount: 80 }),
      cost({ category: 'repairs', date: '2025-02-01', amount: 120 }),
      cost({ category: 'insurance', date: '2025-02-01', amount: 96 }),
      cost({ category: 'loan_interest', date: '2025-04-01', amount: 400 }),
    ],
  );

  it('names the form and puts the amounts under the numbers of form 7H, with the form’s own Finnish words', () => {
    const blocks = model(flat);
    expect(blocks[0]).toEqual({ type: 'h1', text: 'Rental income & expenses 2025' });
    expect(blocks[1]).toEqual({ type: 'subtitle', text: 'Vuokratulot ja -menot (figures for tax form 7H / OmaVero)' });
    expect(forms(blocks)).toEqual([
      ['2.1', 'Rent for the whole year, gross', 'Vuokratulojen määrä koko vuonna (oma osuus, brutto)', 2000],
      ['2.2', 'Maintenance charges and water charges', 'Hoitovastikkeet ja vesimaksut (oma osuus)', 300],
      ['2.3', 'Financing charges booked as income by the company', 'Yhtiön tulouttamat pääomavastikkeet (oma osuus)', 80],
      ['2.4', 'Annual repairs', 'Vuosikorjausten kulut (oma osuus)', 120],
      ['2.5', 'Other expenses', 'Muut kulut (oma osuus)', 96],
    ]);
  });

  it('lists what 2.5 is made of, so it can be checked against the receipts', () => {
    const parts = model(flat).flatMap((b) => (b.type === 'part' ? [[b.label, b.value] as const] : []));
    expect(parts).toEqual([['Insurance (Vakuutukset)', 96]]);
  });

  it('keeps the loan interest off the form and says where it goes', () => {
    const blocks = model(flat);
    expect(texts(blocks)).toContain('Declared separately (not on the rental form)');
    expect(texts(blocks)).toContain('Loan interest (Lainan korot)');
    expect(texts(blocks)).toContain('declared with the interest deductions in OmaVero');
  });

  it('gives the period the flat was let, which the form asks for', () => {
    const rows = model(flat).flatMap((b) => (b.type === 'row' ? [[b.left, b.right] as const] : []));
    expect(rows).toContainEqual(['Let during', '1.1.2025–28.2.2025']);
  });

  it('shows the apartment total beside the owner’s share only when the apartment is shared', () => {
    const solo = model(flat).filter((b) => b.type === 'amount');
    expect(solo.length).toBeGreaterThan(0);
    const shared = model(apartment({}, [], [paid('2025-01')], 25));
    expect(texts(shared)).toContain('The apartment has 2 owners. Each owner declares their own share');
    expect(shared.find((b) => b.type === 'h2' && b.text.startsWith('Income'))).toMatchObject({ columns: true });
    expect(shared.find((b) => b.type === 'amount' && b.left === 'Total rent received')).toMatchObject({ total: 1000, mine: 250 });
  });

  it('says what is deducted over several years: this year’s part of each, and the inventory the law asks for', () => {
    const l = apartment({}, [
      cost({ category: 'improvement', date: '2024-05-01', amount: 3000, description: 'Balcony glazing' }),
      cost({ category: 'furniture', date: '2024-03-01', amount: 2000, description: 'Dryer' }),
    ]);
    const blocks = model(l);
    expect(forms(blocks).find(([ref]) => ref === '2.5')![3]).toBe(675);
    const t = texts(blocks);
    expect(t).toContain('Basic improvements deducted over several years');
    expect(t).toContain('2024-05-01 Balcony glazing');
    expect(t).toContain('Inventory of furniture and appliances');
    expect(t).toContain('2024-03-01 Dryer');
  });

  it('lists a funded financing charge as not deductible, with the reason', () => {
    const l = apartment({}, [cost({ category: 'financing_charge', date: '2025-02-01', amount: 80 })]);
    const t = texts(model(l));
    expect(t).toContain('Not deductible: Financing charge (Rahoitusvastike)');
    expect(t).toContain('increases the acquisition cost');
  });
});

describe('the declaration for a property of one’s own', () => {
  const house = apartment(
    { propertyType: 'property', useDepreciation: true, purchasePrice: 100000, depreciationPrior: 20000 },
    [
      cost({ category: 'repairs', date: '2025-02-01', amount: 500 }),
      cost({ category: 'property_tax', date: '2025-09-01', amount: 200 }),
      cost({ category: 'improvement', date: '2025-05-01', amount: 20000 }),
      cost({ category: 'furniture', date: '2025-03-01', amount: 2000 }),
    ],
    [paid('2025-01', 12000)],
  );

  it('puts the amounts under the numbers of form 7K, including the result as 3.4 or 3.5', () => {
    const rows = forms(model(house));
    expect(rows.map((r) => r[0])).toEqual(['2', '3.1', '3.2', '3.3', '3.4', '3.5', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.2', '4.3', '4.4', '4.5', '4.6']);
    const value = (ref: string, nth = 0) => rows.filter((r) => r[0] === ref)[nth]![3];
    expect(value('2')).toBe(12000);
    expect(value('3.1')).toBe(500);
    expect(value('3.2')).toBe(200);
    expect(value('3.3')).toBe(4500);
    expect(value('3.4')).toBe(6800);
    expect(value('3.5')).toBe(0);
  });

  it('fills in the building’s depreciation table as vero.fi does: 80 000 + 20 000 → 4 000, 96 000 left', () => {
    const rows = forms(model(house));
    expect(rows.slice(6, 12).map((r) => [r[0], r[3]])).toEqual([
      ['4.1', 100000],
      ['4.2', 80000],
      ['4.3', 20000],
      ['4.4', 100000],
      ['4.5', 4000],
      ['4.6', 96000],
    ]);
  });

  it('fills in the loose-property column of the depreciation table too', () => {
    const rows = forms(model(house));
    expect(rows.slice(12).map((r) => [r[0], r[3]])).toEqual([
      ['4.2', 0],
      ['4.3', 2000],
      ['4.4', 2000],
      ['4.5', 500],
      ['4.6', 1500],
    ]);
  });

  it('puts a loss in 3.5 and nothing in 3.4', () => {
    const l = apartment({ propertyType: 'property' }, [cost({ category: 'repairs', date: '2025-02-01', amount: 2500 })]);
    const rows = forms(model(l));
    expect(rows.find((r) => r[0] === '3.4')![3]).toBe(0);
    expect(rows.find((r) => r[0] === '3.5')![3]).toBe(500);
  });

  it('has no depreciation table when there is no depreciation and no loose property', () => {
    const l = apartment({ propertyType: 'property' }, []);
    expect(forms(model(l)).map((r) => r[0])).toEqual(['2', '3.1', '3.2', '3.3', '3.4', '3.5']);
  });
});

describe('what the declaration says about the rest', () => {
  it('shows the deficit credit under a loss, and how it is limited', () => {
    const l = apartment({}, [cost({ category: 'repairs', date: '2025-02-01', amount: 4000 })]);
    const t = texts(model(l));
    expect(t).toContain('Deficit credit, up to');
    expect(t).toContain('30%');
    const credit = model(l).find((b) => b.type === 'row' && b.left === 'Deficit credit, up to');
    expect(credit).toMatchObject({ right: expect.stringContaining('600,00') });
  });

  it('writes the rates of the year, not fixed ones', () => {
    const t = texts(model(apartment({}, [])));
    expect(t).toContain('30% on capital income up to 30 000 EUR and 34% above');
  });

  it('names the flat-rate furniture deduction and the rent limit', () => {
    const l = apartment({ furnishing: 'flat', belowMarketRent: true }, [cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 3000 })]);
    const blocks = model(l);
    expect(texts(blocks)).toContain('Furnished flat, flat-rate deduction (Kalustevähennys)');
    expect(texts(blocks)).toContain('Reduce the rows above by');
  });

  it('says the flat is let in part, and for less than the usual rent', () => {
    const rows = model(apartment({ letSharePct: 60, belowMarketRent: true }, [])).flatMap((b) => (b.type === 'row' ? [[b.left, b.right] as const] : []));
    expect(rows).toContainEqual(['Share of the home that is let', '60 %']);
    expect(rows).toContainEqual(['Rent', 'below the usual rent']);
  });

  it('reminds how long to keep the notes and receipts', () => {
    expect(texts(model(apartment({}, [])))).toContain('Keep this declaration, your notes and the receipts for 6 years');
  });
});
