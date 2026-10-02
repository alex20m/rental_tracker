'use client';

import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { CATEGORIES } from '@/lib/domain/types';
import type { ApartmentView } from '@/lib/domain/types';
import { computeTax, MONTHS, ownerShare } from '@/lib/domain/tax';
import type { OwnerShare, TaxResult } from '@/lib/domain/tax';
import { fetchReceipt } from '@/lib/client/api';

/**
 * jsPDF's built-in fonts only cover WinAnsi. Finnish number formatting writes a
 * negative with U+2212 (not "-") and groups thousands with no-break spaces, and
 * a single character outside WinAnsi turns the whole line into unreadable
 * glyphs — so every string goes through this before it reaches the page.
 */
export const pdfSafe = (s: string) => s.replace(/\u2212/g, '-').replace(/[\u00a0\u202f]/g, ' ');

// The built-in fonts can't render the € glyph reliably either, so amounts use "EUR".
const money = (n: number) =>
  pdfSafe(new Intl.NumberFormat('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR');
const pctText = (n: number) => pdfSafe(new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(n) + ' %');

/**
 * The declaration for one owner of one apartment. Co-owners each declare their
 * own part, so when the apartment is shared every amount is shown twice: the
 * apartment's total, and the owner's share of it — the column to file.
 */
export function buildPdf(apt: ApartmentView, t: TaxResult, share: OwnerShare, taxpayerName: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  /** Every string reaches the page through here, so none can carry a glyph the font lacks. */
  const put = (text: string | string[], x: number, y: number, options?: { align: 'right' }) =>
    doc.text(Array.isArray(text) ? text.map(pdfSafe) : pdfSafe(text), x, y, options);
  const s = apt.settings;
  const shared = share.sharePct !== 100;
  const W = 210;
  const L = 18;
  const R = W - 18;
  const MID = R - 42; // the "apartment total" column when shared
  let y = 20;

  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 20;
    }
  };
  const h1 = (txt: string) => {
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(15, 118, 110);
    put(txt, L, y);
    y += 8;
  };
  const h2 = (txt: string, columns = false) => {
    ensure(14);
    y += 4;
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(30, 41, 59);
    put(txt, L, y);
    if (columns && shared) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(100, 116, 139);
      put('Apartment total', MID, y, { align: 'right' });
      put(`Your share ${pctText(share.sharePct)}`, R, y, { align: 'right' });
    }
    y += 2;
    doc.setDrawColor(203, 213, 225).line(L, y, R, y);
    y += 6;
  };
  const row = (left: string, right: string, bold = false) => {
    ensure(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(10).setTextColor(30, 41, 59);
    put(left, L, y);
    put(right, R, y, { align: 'right' });
    y += 6;
  };
  /** An amount: the owner's share, with the apartment total beside it when shared. */
  const amount = (left: string, total: number, mine: number, bold = false) => {
    ensure(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(10).setTextColor(30, 41, 59);
    put(left, L, y);
    if (shared) {
      doc.setTextColor(100, 116, 139);
      put(money(total), MID, y, { align: 'right' });
      doc.setTextColor(30, 41, 59);
    }
    put(money(mine), R, y, { align: 'right' });
    y += 6;
  };
  const small = (txt: string) => {
    const lines = doc.splitTextToSize(txt, R - L) as string[];
    ensure(lines.length * 4.5 + 2);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(100, 116, 139);
    put(lines, L, y);
    y += lines.length * 4.5 + 2;
  };

  h1(`Rental income & expenses ${t.year}`);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(100, 116, 139);
  put('Vuokratulot ja -menot (summary for tax form 9 / OmaVero)', L, y);
  y += 6;

  h2('Taxpayer & property');
  row('Taxpayer', taxpayerName || '—');
  row('Ownership share', pctText(share.sharePct));
  row('Property', s.name);
  row('Address', s.address || '—');
  row('Housing company', s.housingCompany || '—');
  row('Purchased', s.purchaseDate ? `${s.purchaseDate} for ${money(s.purchasePrice)}` : '—');
  if (shared) {
    small(
      `The apartment has ${apt.owners.length} owner${apt.owners.length === 1 ? '' : 's'}` +
        `${apt.invites.length ? ` and ${apt.invites.length} pending` : ''}. Each owner declares their own share of ` +
        'the income and expenses; the right-hand column is yours.',
    );
  }

  h2('Income (Vuokratulot)', true);
  const monthly = Array(12).fill(0) as number[];
  for (const r of apt.rents) {
    if (r.status === 'paid' && r.receivedDate.startsWith(String(t.year))) {
      monthly[Number(r.receivedDate.slice(5, 7)) - 1]! += r.amount;
    }
  }
  monthly.forEach((v, i) => {
    if (v) amount(`${MONTHS[i]} ${t.year}`, v, Math.round(v * share.sharePct) / 100);
  });
  amount('Total rent received', t.rentIncome, share.rentIncome, true);
  small(
    `Months paid: ${t.paidMonths} · vacant: ${t.vacantMonths} · unpaid: ${t.unpaidMonths}. ` +
      `Rent is reported in the year it was received.`,
  );

  h2('Expenses (Vähennyskelpoiset menot)', true);
  const mineFor = (category: string) => share.lines.find((l) => l.category === category)!.amount;
  for (const l of t.lines.filter((l) => l.deductible)) amount(`${l.label} (${l.fi})`, l.amount, mineFor(l.category));
  amount('Total deductible expenses', t.deductibleCosts, share.deductibleCosts, true);
  if (t.depreciation) {
    amount('Depreciation (Poisto)', t.depreciation, share.depreciation);
    small(
      `${s.depreciationRate}% reducing balance on ${money((s.purchasePrice * s.buildingSharePct) / 100)} ` +
        `depreciable cost, less ${money(s.depreciationPrior)} already depreciated.`,
    );
  }
  const nd = t.lines.filter((l) => !l.deductible);
  if (nd.length) {
    y += 2;
    for (const l of nd) amount(`Not deductible: ${l.label} (${l.fi})`, l.amount, mineFor(l.category));
    small('Financing charges are not an expense; they increase the acquisition cost of the shares.');
  }

  h2('Result', true);
  amount('Rent income', t.rentIncome, share.rentIncome);
  amount('− Deductible expenses', t.deductibleCosts, share.deductibleCosts);
  amount('− Depreciation', t.depreciation, share.depreciation);
  amount(
    share.netIncome >= 0 ? 'Taxable rental income (Pääomatulo)' : 'Rental loss (Alijäämä)',
    t.netIncome,
    share.netIncome,
    true,
  );
  row('Estimated capital income tax on your share', money(share.estimatedTax), true);
  small(
    'Estimate only: 30% on capital income up to 30 000 EUR and 34% above, before any other capital income or ' +
      'deductions. Verify the figures and current rules on vero.fi before filing.',
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(148, 163, 184);
    put(`Generated ${new Date().toISOString().slice(0, 10)} by Rental Tracker — page ${p}/${pages}`, L, 290);
  }
  return doc.output('blob');
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** The apartment's full ledger for the year; the share column is the owner's part of each amount. */
export function buildCsv(apt: ApartmentView, year: number, sharePct: number, receiptNames: Map<string, string>): string {
  const y = String(year);
  const part = (n: number) => Math.round(n * sharePct) / 100;
  const rows: (string | number)[][] = [
    ['date', 'type', 'category', 'description', 'amount_eur', `your_share_eur_${sharePct}pct`, 'receipt_file'],
  ];
  for (const r of apt.rents.filter((r) => r.month.startsWith(y) || r.receivedDate.startsWith(y))) {
    rows.push([
      r.receivedDate || r.month,
      'rent',
      r.status,
      `Rent for ${r.month}${r.note ? ' – ' + r.note : ''}`,
      r.amount,
      part(r.amount),
      '',
    ]);
  }
  for (const c of apt.costs.filter((c) => c.date.startsWith(y))) {
    rows.push([c.date, 'cost', CATEGORIES[c.category].label, c.description, -c.amount, -part(c.amount), receiptNames.get(c.id) ?? '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** Zip: declaration PDF + ledger CSV + JSON summary + all receipt images for the year. */
export async function buildPackage(apt: ApartmentView, year: number, taxpayerName: string): Promise<Blob> {
  const t = computeTax(apt, year);
  const share = ownerShare(t, apt.mySharePct);
  const zip = new JSZip();
  zip.file(`vuokratulot-ja-menot-${year}.pdf`, buildPdf(apt, t, share, taxpayerName));

  const names = new Map<string, string>();
  const folder = zip.folder('receipts')!;
  for (const c of apt.costs.filter((c) => c.date.startsWith(String(year)) && c.hasReceipt)) {
    const receipt = await fetchReceipt(apt.id, c.id);
    if (!receipt) continue;
    const safe = c.description.replace(/[^a-z0-9]+/gi, '-').slice(0, 30).replace(/^-|-$/g, '') || c.category;
    const name = `${c.date}_${safe}_${c.id.slice(0, 8)}.${receipt.extension}`;
    folder.file(name, receipt.data);
    names.set(c.id, `receipts/${name}`);
  }
  zip.file(`ledger-${year}.csv`, buildCsv(apt, year, apt.mySharePct, names));
  zip.file(`summary-${year}.json`, JSON.stringify({ apartment: t, yourShare: share }, null, 2));
  return zip.generateAsync({ type: 'blob' });
}
