import { describe, expect, it } from 'vitest';
import { buildCsv, buildPdf } from '@/lib/client/declaration';
import { computeTax, ownerShare } from '@/lib/domain/tax';
import { defaultSettings, type ApartmentView } from '@/lib/domain/types';

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

describe("the declaration's PDF", () => {
  // jsPDF writes text uncompressed by default, so the figures can be read back.
  const textOf = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const t = computeTax(apt, year, today);

  it('states the ownership share and files the owner’s part, not the whole', async () => {
    const pdf = await textOf(buildPdf(apt, t, ownerShare(t, 25), 'Alice Aalto'));

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
    const pdf = await textOf(buildPdf(apt, t, ownerShare(t, 25), 'Alice Aalto'));

    expect(pdf).toContain('(- Deductible expenses) Tj');
    expect(pdf).toContain('(- Depreciation) Tj');
    expect(pdf).not.toMatch(/\(\S*\u0000/);
  });

  it('names form 7K for a property and 7H for a housing-company flat, which has no building depreciation', async () => {
    const property = await textOf(buildPdf(apt, t, ownerShare(t, 25), 'Alice Aalto'));
    expect(property).toContain('figures for tax form 7K / OmaVero');
    // The depreciation table of the form: 4.5 is the year's depreciation (2 500 € of the apartment, a quarter of it).
    expect(property).toMatch(/\(4\.5\) Tj[\s\S]*?\(625,00 EUR\) Tj/);

    const flat = { ...apt, settings: { ...apt.settings, propertyType: 'share' as const } };
    const tf = computeTax(flat, year, today);
    const pdf = await textOf(buildPdf(flat, tf, ownerShare(tf, 25), 'Alice Aalto'));
    expect(pdf).toContain('figures for tax form 7H / OmaVero');
    expect(pdf).not.toContain('Verovuoden poisto');
    // 800 − 120, with nothing depreciated.
    expect(pdf).toContain('(680,00 EUR) Tj');
  });

  it('lists loan interest apart from the form, spread costs as this year’s part, and a funded financing charge as not deductible', async () => {
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
    const tf = computeTax(flat, year, today);
    const pdf = await textOf(buildPdf(flat, tf, ownerShare(tf, 100), 'Alice Aalto'));

    expect(pdf).toContain('(Declared separately \\(not on the rental form\\)) Tj');
    // Only the maintenance charge is in 2.2; interest is declared apart.
    expect(pdf).toMatch(/\(2\.2\) Tj[\s\S]*?\(Maintenance charges and water charges\) Tj[\s\S]*?\(200,00 EUR\) Tj/);
    // 2.5 is the improvement's tenth and the sofa's quarter, with the parts under it.
    expect(pdf).toMatch(/\(2\.5\) Tj[\s\S]*?\(800,00 EUR\) Tj/);
    expect(pdf).toMatch(/of which Basic improvements, this year's part[\s\S]*?\(300,00 EUR\) Tj/);
    expect(pdf).toMatch(/of which Furniture & appliances, this year's part[\s\S]*?\(500,00 EUR\) Tj/);
    expect(pdf).toContain('(Not deductible: Financing charge \\(Rahoitusvastike\\)) Tj');
    // 800 − 200 − 400 interest − 300 − 500 = −600.
    expect(pdf).toContain('(-600,00 EUR) Tj');
  });

  it('shows a single column for a sole owner', async () => {
    const solo = { ...apt, owners: [apt.owners[0]!], mySharePct: 100 };
    const pdf = await textOf(buildPdf(solo, t, ownerShare(t, 100), 'Alice Aalto'));

    expect(pdf).not.toContain('Your share');
    expect(pdf).not.toContain('Apartment total');
  });
});
