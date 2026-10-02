import { describe, expect, it } from 'vitest';
import { buildCsv, buildPdf } from '@/lib/client/declaration';
import { computeTax, ownerShare } from '@/lib/domain/tax';
import { defaultSettings, type ApartmentView } from '@/lib/domain/types';

const apt: ApartmentView = {
  id: '11111111-1111-4111-8111-111111111111',
  settings: { ...defaultSettings, name: 'Kauppakatu 12', purchasePrice: 100000, useDepreciation: true },
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

  it('shows a single column for a sole owner', async () => {
    const solo = { ...apt, owners: [apt.owners[0]!], mySharePct: 100 };
    const pdf = await textOf(buildPdf(solo, t, ownerShare(t, 100), 'Alice Aalto'));

    expect(pdf).not.toContain('Your share');
    expect(pdf).not.toContain('Apartment total');
  });
});
