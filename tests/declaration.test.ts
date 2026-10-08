import { describe, expect, it } from 'vitest';
import { buildCsv, buildPdf, pdfSafe } from '@/lib/client/declaration';
import { computeTax, ownerShare } from '@/lib/domain/tax';
import { defaultSettings, type ApartmentView } from '@/lib/domain/types';
import { en } from '@/lib/i18n/en';
import { translator, LANGS, type Lang } from '@/lib/i18n';

const apt: ApartmentView = {
  id: '11111111-1111-4111-8111-111111111111',
  // A property of one's own, so its building is depreciated.
  settings: {
    ...defaultSettings,
    name: 'Kauppakatu 12',
    propertyType: 'property',
    purchasePrice: 100000,
    useDepreciation: true,
    depreciationRate: 2.5,
  },
  owners: [
    { userId: 'usr_a', email: 'a@example.test', sharePct: 25 },
    { userId: 'usr_b', email: 'b@example.test', sharePct: 75 },
  ],
  invites: [],
  recurring: [],
  acquisitionCosts: [],
  rents: [{ month: '2025-01', status: 'paid', amount: 800, receivedDate: '2025-01-03', note: '' }],
  costs: [{ id: 'c1', date: '2025-02-01', category: 'repairs', description: 'Tap "kitchen"', amount: 120, hasReceipt: true }],
  mySharePct: 25,
};

const year = 2025;
const today = new Date('2026-03-01T12:00:00Z');

describe("the declaration's ledger", () => {
  it('lists each amount for the apartment and the owner’s part of it', () => {
    const csv = buildCsv(apt, year, 25, new Map([['c1', 'receipts/tap.jpg']]));

    expect(csv.split('\n')).toEqual([
      '"date","type","category","description","amount_eur","your_share_eur_25pct","receipt_file"',
      '"2025-01-03","rent","paid","Rent for 2025-01","800","200",""',
      '"2025-02-01","cost","Repairs & upkeep","Tap ""kitchen""","-120","-30","receipts/tap.jpg"',
    ]);
  });
});

describe("the declaration's ledger, to the cent", () => {
  it('takes the cent right in the owner’s part of an amount that lands on a half cent: half of 1 024,09 is 512,045', () => {
    const odd: ApartmentView = {
      ...apt,
      rents: [{ month: '2025-01', status: 'paid', amount: 1024.09, receivedDate: '2025-01-03', note: '' }],
      costs: [{ id: 'c1', date: '2025-02-01', category: 'repairs', description: '', amount: 1024.09, hasReceipt: false }],
    };
    const rows = buildCsv(odd, year, 50, new Map()).split('\n');

    expect(rows[1]).toContain('"1024.09","512.05"');
    expect(rows[2]).toContain('"-1024.09","-512.05"');
  });
});

describe("the declaration's PDF", () => {
  // jsPDF writes text uncompressed by default, so the figures can be read back.
  const textOf = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const pdfFor = (a: ApartmentView, pct: number, lang: Lang = 'en') => {
    const tax = computeTax(a, year, today);
    return textOf(buildPdf(a, tax, ownerShare(tax, pct), 'Alice Aalto', translator(lang)));
  };

  it('states the ownership share and files the owner’s part, not the whole', async () => {
    const pdf = await pdfFor(apt, 25);

    expect(pdf).toContain('Ownership share');
    expect(pdf).toContain('Your share 25 %');
    // Net: 800 − 120 − 2 500 depreciation = −1 820 for the apartment; a quarter is −455.
    expect(pdf).toContain('(-1 820,00 EUR) Tj');
    expect(pdf).toContain('(-455,00 EUR) Tj');
    expect(pdf).toContain('Alice Aalto');
  });

  it('writes a loss and the subtraction lines in characters the PDF font can show', async () => {
    // Finnish number formatting writes negatives with U+2212 and groups
    // thousands with no-break spaces. The built-in PDF fonts have no U+2212, and
    // one such character turns the whole line into unreadable glyphs.
    const pdf = await pdfFor(apt, 25);

    expect(pdf).toContain('(- Deductible expenses) Tj');
    expect(pdf).toContain('(- Depreciation) Tj');
    expect(pdf).not.toMatch(/\(\S*\u0000/);
  });

  it('names form 7K for a property and 7H for a housing-company flat, which has no building depreciation', async () => {
    const property = await pdfFor(apt, 25);
    expect(property).toContain('figures for tax form 7K / OmaVero');
    // The depreciation table of the form: 4.5 is the year's depreciation (2 500 € of the apartment, a quarter of it).
    expect(property).toMatch(/\(4\.5\) Tj[\s\S]*?\(625,00 EUR\) Tj/);

    const flat = { ...apt, settings: { ...apt.settings, propertyType: 'share' as const } };
    const pdf = await pdfFor(flat, 25);
    expect(pdf).toContain('(Rental income 2025: what to enter in MyTax) Tj');
    expect(pdf).not.toContain('Verovuoden poisto');
    // 800 − 120, with nothing depreciated.
    expect(pdf).toContain('(680,00 EUR) Tj');
  });

  it('puts loan interest under Interest on debts, spread costs as this year’s part in Other expenses, and a funded financing charge as not deductible', async () => {
    const flat: ApartmentView = {
      ...apt,
      settings: { ...apt.settings, propertyType: 'share' },
      costs: [
        { id: 'i', date: '2025-03-01', category: 'loan_interest', description: '', amount: 400, hasReceipt: true },
        { id: 'p', date: '2025-04-01', category: 'improvement', description: '', amount: 3000, hasReceipt: true },
        { id: 'f', date: '2025-05-01', category: 'furniture', description: '', amount: 2000, hasReceipt: true },
        { id: 'r', date: '2025-06-01', category: 'financing_charge', description: '', amount: 90, hasReceipt: true },
        { id: 'm', date: '2025-06-01', category: 'maintenance_charge', description: '', amount: 200, hasReceipt: true },
      ],
    };
    const pdf = await pdfFor(flat, 100);

    // Only the maintenance charge is in its field; interest is entered under Interest on debts.
    expect(pdf).toMatch(/Monthly maintenance charges and water charges \\\(your portion\\\)\) Tj[\s\S]*?\(200,00 EUR\) Tj/);
    expect(pdf).toMatch(/\(4 · Other deductions: Interest on debts\) Tj[\s\S]*?Loan interest \\\(your portion\\\)\) Tj[\s\S]*?\(400,00 EUR\) Tj/);
    // "Other expenses" is the improvement's tenth and the sofa's quarter, with the parts under it.
    expect(pdf).toMatch(/\(Other expenses\) Tj[\s\S]*?\(800,00 EUR\) Tj/);
    expect(pdf).toMatch(/of which Basic improvements, this year.s part\) Tj[\s\S]*?\(300,00 EUR\) Tj/);
    expect(pdf).toMatch(/of which Furniture & appliances, this year.s part\) Tj[\s\S]*?\(500,00 EUR\) Tj/);
    expect(pdf).toContain('(Not deductible: Financing charge) Tj');
    // 800 − 200 − 400 interest − 300 − 500 = −600.
    expect(pdf).toContain('(-600,00 EUR) Tj');
  });

  it('shows a single column for a sole owner', async () => {
    const solo = { ...apt, owners: [apt.owners[0]!], mySharePct: 100 };
    const pdf = await pdfFor(solo, 100);

    expect(pdf).not.toContain('Your share');
    expect(pdf).not.toContain('Apartment total');
  });

  it('is written in the language of the reader, down to the page footer', async () => {
    const flat = { ...apt, settings: { ...apt.settings, propertyType: 'share' as const } };
    const sv = await pdfFor(flat, 25, 'sv');
    expect(sv).toContain('(Hyresinkomster 2025: det h\xe4r fyller du i i MinSkatt) Tj');
    expect(sv).toMatch(/\(Skapad \d{4}-\d{2}-\d{2} av Rental Tracker .{1,3} sida 1\/\d\)/);
    const fi = await pdfFor(flat, 25, 'fi');
    expect(fi).toContain('(Vuokratulot 2025: n\xe4m\xe4 tiedot sy\xf6t\xe4t OmaVeroon) Tj');
    expect(fi).toMatch(/Luotu \d{4}-\d{2}-\d{2} Rental Tracker -sovelluksella .{1,3} sivu 1\/\d\)/);
    expect(await pdfFor(flat, 25, 'en')).toMatch(/Generated \d{4}-\d{2}-\d{2} by Rental Tracker .{1,3} page 1\/\d\)/);
  });

  it('keeps a property of one’s own in English with the numbers of form 7K, whatever the language', async () => {
    const pdf = await pdfFor(apt, 25, 'sv');
    expect(pdf).toContain('figures for tax form 7K / OmaVero');
    expect(pdf).toContain('Your share 25 %');
  });

  it('has no character in any language that the PDF font cannot show', () => {
    // jsPDF's built-in fonts cover Windows-1252. A character outside it (an arrow, say) is drawn as
    // other glyphs, so every PDF message, once made safe, has to stay inside this set.
    const winAnsi = /^[\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac\u2039\u203a]*$/;
    for (const lang of LANGS) {
      const { t } = translator(lang);
      for (const key of Object.keys(en).filter((k) => k.startsWith('pdf.') || k.startsWith('cat.')) as (keyof typeof en)[]) {
        expect({ lang, key, text: pdfSafe(t(key)) }).toEqual({ lang, key, text: expect.stringMatching(winAnsi) });
      }
    }
  });
});
