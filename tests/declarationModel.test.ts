import { describe, expect, it } from 'vitest';
import { declarationModel, type PdfBlock } from '@/lib/domain/declarationModel';
import { computeTax, ownerShare } from '@/lib/domain/tax';
import { defaultSettings, type ApartmentView, type CostEntry } from '@/lib/domain/types';
import { translator, type Lang } from '@/lib/i18n';

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
  recurring: [],
  rents,
  costs,
  mySharePct: pct,
});
const model = (apt: ApartmentView, year = 2025, lang: Lang = 'en') => {
  const t = computeTax(apt, year, today);
  return declarationModel(apt, t, ownerShare(t, apt.mySharePct), 'Aino Aalto', translator(lang));
};
const forms = (blocks: PdfBlock[]) =>
  blocks.flatMap((b) => (b.type === 'form' ? [[b.ref, b.label, b.fi, b.value] as const] : []));
const fields = (blocks: PdfBlock[]) => blocks.flatMap((b) => (b.type === 'field' ? [[b.label, b.value] as const] : []));
const headings = (blocks: PdfBlock[]) => blocks.flatMap((b) => (b.type === 'h2' ? [b.text] : []));
const texts = (blocks: PdfBlock[]) =>
  blocks.flatMap((b) => ('text' in b ? [b.text] : 'left' in b ? [b.left] : 'label' in b ? [b.label] : [])).join('\n');

describe('the declaration for a flat in a housing company', () => {
  const flat = apartment(
    { financingChargeDeductible: true, housingCompany: 'As Oy Kauppa' },
    [
      cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 300 }),
      cost({ category: 'financing_charge', date: '2025-02-01', amount: 80 }),
      cost({ category: 'repairs', date: '2025-02-01', amount: 120 }),
      cost({ category: 'insurance', date: '2025-02-01', amount: 96 }),
      cost({ category: 'loan_interest', date: '2025-04-01', amount: 400 }),
    ],
  );

  it('goes through the stages of OmaVero in order, named as OmaVero names them in each language', () => {
    expect(headings(model(flat, 2025, 'sv')).slice(0, 5)).toEqual([
      '1 · Öppna hyresinkomsterna i MinSkatt',
      '2 · Aktielägenheten',
      '3 · Inkomster och utgifter för uthyrningen',
      '4 · Övriga avdrag: Räntor på skuld',
      '5 · Förhandsgranska och skicka',
    ]);
    expect(headings(model(flat, 2025, 'fi')).slice(0, 5)).toEqual([
      '1 · Avaa vuokratulot OmaVerossa',
      '2 · Osakehuoneisto',
      '3 · Vuokrauksen tulot ja kulut',
      '4 · Muut vähennykset: Velan korot',
      '5 · Esikatsele ja lähetä',
    ]);
    expect(headings(model(flat, 2025, 'en')).slice(0, 5)).toEqual([
      '1 · Open rental income in MyTax',
      '2 · The apartment',
      '3 · Rental income and expenses',
      '4 · Other deductions: Interest on debts',
      '5 · Preview and send',
    ]);
  });

  it('opens with the title in the language of the reader, and the way to the form for that tax year', () => {
    const sv = model(flat, 2025, 'sv');
    expect(sv[0]).toEqual({ type: 'h1', text: 'Hyresinkomster 2025: det här fyller du i i MinSkatt' });
    expect(texts(sv)).toContain(
      'Förhandsifylld skattedeklaration 2025 > Kontrollera den förhandsifyllda skattedeklarationen > Korrigera uppgifterna i den förhandsifyllda skattedeklarationen > fasen Övriga inkomster > Hyresinkomster: Ja > Lägg till en ny hyresinkomst',
    );
    expect(texts(model(flat, 2026, 'en'))).toContain('Pre-completed tax return 2026 > Check your pre-completed tax return');
  });

  it('names each field as OmaVero does, with the owner’s own amount, in Swedish', () => {
    expect(fields(model(flat, 2025, 'sv'))).toEqual([
      ['Hyresinkomster under hela året, brutto (egen andel)', 2000],
      ['Skötselvederlag och vattenavgifter (egen andel)', 300],
      ['Kapitalvederlag som bolaget intäktsfört (egen andel)', 80],
      ['Kostnader för årliga reparationer (egen andel)', 120],
      ['Övriga kostnader', 96],
      ['Lånets räntor (egen andel)', 400],
    ]);
  });

  it('names each field as OmaVero does, in Finnish', () => {
    expect(fields(model(flat, 2025, 'fi'))).toEqual([
      ['Vuokratulot koko vuodelta, brutto (oma osuus)', 2000],
      ['Hoitovastikkeet ja vesimaksut (oma osuus)', 300],
      ['Yhtiön tulouttamat pääomavastikkeet (oma osuus)', 80],
      ['Vuosikorjausten kulut (oma osuus)', 120],
      ['Muut kulut', 96],
      ['Lainan korot (oma osuus)', 400],
    ]);
  });

  it('names each field as MyTax does, in English', () => {
    expect(fields(model(flat, 2025, 'en'))).toEqual([
      ['Rent received during the year, gross (your portion)', 2000],
      ['Monthly maintenance charges and water charges (your portion)', 300],
      ['Charges for financial costs entered as income by the company (your portion)', 80],
      ['Annual repairs (your portion)', 120],
      ['Other expenses', 96],
      ['Loan interest (your portion)', 400],
    ]);
  });

  it('says which field names are not published, so a different label on screen is no surprise', () => {
    expect(texts(model(flat, 2025, 'en'))).toContain('The names of the rent and annual-repairs fields are not published');
  });

  it('lists what “Other expenses” is made of, so it can be checked against the receipts', () => {
    const parts = (lang: Lang) => model(flat, 2025, lang).flatMap((b) => (b.type === 'part' ? [[b.label, b.value] as const] : []));
    expect(parts('sv')).toEqual([['varav Försäkringar', 96]]);
    expect(parts('fi')).toEqual([['joista Vakuutukset', 96]]);
    expect(parts('en')).toEqual([['of which Insurance', 96]]);
  });

  it('puts loan interest under Interest on debts, not in the rental income fields', () => {
    const blocks = model(flat, 2025, 'en');
    const at = (label: string) => blocks.findIndex((b) => b.type === 'field' && b.label === label);
    expect(at('Loan interest (your portion)')).toBeGreaterThan(blocks.findIndex((b) => b.type === 'h2' && b.text.startsWith('4 ·')));
    expect(at('Other expenses')).toBeLessThan(blocks.findIndex((b) => b.type === 'h2' && b.text.startsWith('4 ·')));
    expect(texts(blocks)).toContain('Interest is not entered in the rental income form');
  });

  it('says there is nothing to enter under Interest on debts when no loan interest was paid', () => {
    const blocks = model(apartment({}, []), 2025, 'sv');
    expect(fields(blocks).map((f) => f[0])).not.toContain('Lånets räntor (egen andel)');
    expect(texts(blocks)).toContain('Inget att fylla i: inga låneräntor har bokförts för den här lägenheten.');
  });

  it('gives the flat as OmaVero asks for it: housing company, flat, share, and the period it was let', () => {
    const rows = model(flat, 2025, 'sv').flatMap((b) => (b.type === 'row' ? [[b.left, b.right] as const] : []));
    expect(rows).toContainEqual(['Bostadsaktiebolag', 'As Oy Kauppa']);
    expect(rows).toContainEqual(['Lägenhet', 'Kauppakatu 12 B 7, Vaasa']);
    expect(rows).toContainEqual(['Din ägarandel', '100 %']);
    expect(rows).toContainEqual(['Uthyrd under', '1.1.2025–28.2.2025']);
    expect(texts(model(flat, 2025, 'sv'))).toContain('Ange alla hyresgäster som hyrt lägenheten under året');
  });

  it('puts what is only for the owner’s own papers after the steps, on a page of its own', () => {
    const blocks = model(flat, 2025, 'en');
    const records = blocks.findIndex((b) => b.type === 'h2' && b.text === 'For your records (not entered in MyTax)');
    expect(blocks[records]).toMatchObject({ newPage: true });
    expect(records).toBeGreaterThan(blocks.findIndex((b) => b.type === 'h2' && b.text.startsWith('5 ·')));
    expect(blocks.slice(0, records).some((b) => b.type === 'amount')).toBe(false);
  });

  it('ends the steps with preview and send, and that receipts are not attached', () => {
    expect(texts(model(flat, 2025, 'en'))).toContain('Do not attach receipts.');
  });

  it('shows the owner’s share in the fields, and the apartment total beside it only in the records, when shared', () => {
    const shared = model(apartment({}, [cost({ category: 'maintenance_charge', date: '2025-02-01', amount: 400 })], [paid('2025-01')], 25));
    expect(fields(shared).slice(0, 2)).toEqual([
      ['Rent received during the year, gross (your portion)', 250],
      ['Monthly maintenance charges and water charges (your portion)', 100],
    ]);
    expect(texts(shared)).toContain('The apartment has 2 owners. Each owner declares their own share');
    expect(shared.find((b) => b.type === 'h2' && b.text.startsWith('Income by month'))).toMatchObject({
      columns: { total: 'Apartment total', mine: 'Your share 25 %' },
    });
    expect(shared.find((b) => b.type === 'amount' && b.left === 'Total rent received')).toMatchObject({ total: 1000, mine: 250 });
    const solo = model(flat, 2025, 'en');
    expect(solo.find((b) => b.type === 'h2' && b.text.startsWith('Income by month'))).toMatchObject({ columns: undefined });
  });

  it('takes the cent right in the owner’s part of a month’s rent that lands on a half cent: half of 1 024,09 is 512,045', () => {
    const odd = model(apartment({}, [], [paid('2025-01', 1024.09)], 50));
    expect(odd.find((b) => b.type === 'amount' && b.left.startsWith('Jan'))).toMatchObject({ total: 1024.09, mine: 512.05 });
  });

  it('says what is deducted over several years: this year’s part of each, and the inventory the law asks for', () => {
    const l = apartment({}, [
      cost({ category: 'improvement', date: '2024-05-01', amount: 3000, description: 'Balcony glazing' }),
      cost({ category: 'furniture', date: '2024-03-01', amount: 2000, description: 'Dryer' }),
    ]);
    const blocks = model(l);
    // A tenth of the improvement and a quarter of the dryer, both in "Other expenses".
    expect(fields(blocks).find(([label]) => label === 'Other expenses')![1]).toBe(675);
    const t = texts(blocks);
    expect(t).toContain('Basic improvements deducted over several years');
    expect(t).toContain('2024-05-01 Balcony glazing');
    expect(t).toContain('Inventory of furniture and appliances');
    expect(t).toContain('2024-03-01 Dryer');
  });

  it('lists a funded financing charge as not deductible, with the reason', () => {
    const l = apartment({}, [cost({ category: 'financing_charge', date: '2025-02-01', amount: 80 })]);
    const t = texts(model(l));
    expect(t).toContain('Not deductible: Financing charge');
    expect(t).toContain('increases the acquisition cost');
    expect(texts(model(l, 2025, 'sv'))).toContain('Inte avdragsgillt: Finansieringsvederlag');
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
    expect(texts(blocks)).toContain('of which Furnished flat, flat-rate deduction');
    expect(texts(blocks)).toContain('Reduce the fields above by');
    expect(texts(model(l, 2025, 'sv'))).toContain('Minska fälten ovan med');
  });

  it('says the flat is let in part, and for less than the usual rent', () => {
    const rows = model(apartment({ letSharePct: 60, belowMarketRent: true }, [])).flatMap((b) => (b.type === 'row' ? [[b.left, b.right] as const] : []));
    expect(rows).toContainEqual(['Share of the home that is let', '60 %']);
    expect(rows).toContainEqual(['Rent', 'below the usual rent']);
    const sv = model(apartment({ letSharePct: 60, belowMarketRent: true }, []), 2025, 'sv').flatMap((b) => (b.type === 'row' ? [[b.left, b.right] as const] : []));
    expect(sv).toContainEqual(['Andel av bostaden som hyrs ut', '60 %']);
    expect(sv).toContainEqual(['Hyra', 'under den sedvanliga hyran']);
  });

  it('reminds how long to keep the notes and receipts', () => {
    expect(texts(model(apartment({}, [])))).toContain('Keep this declaration, your notes and the receipts for 6 years');
  });
});
