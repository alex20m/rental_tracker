'use client';

import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { CATEGORIES } from '@/lib/domain/types';
import type { ApartmentView } from '@/lib/domain/types';
import { computeTax, ownerShare } from '@/lib/domain/tax';
import type { OwnerShare, TaxResult } from '@/lib/domain/tax';
import { declarationModel } from '@/lib/domain/declarationModel';
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
 * The declaration for one owner of one apartment, laid out like Finnish form
 * 7H or 7K: the numbered rows with the amounts to enter. Co-owners each declare
 * their own part, so when the apartment is shared the income and result also
 * show the apartment's total beside the owner's share — the column to file.
 * What it says is decided in `declarationModel`; this only draws it.
 */
export function buildPdf(apt: ApartmentView, t: TaxResult, share: OwnerShare, taxpayerName: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  /** Every string reaches the page through here, so none can carry a glyph the font lacks. */
  const put = (text: string | string[], x: number, y: number, options?: { align: 'right' }) =>
    doc.text(Array.isArray(text) ? text.map(pdfSafe) : pdfSafe(text), x, y, options);
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
  const ink = (bold: boolean, size = 10) => doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(30, 41, 59);
  const grey = (size: number) => doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(100, 116, 139);

  for (const b of declarationModel(apt, t, share, taxpayerName)) {
    switch (b.type) {
      case 'h1':
        doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(15, 118, 110);
        put(b.text, L, y);
        y += 8;
        break;
      case 'subtitle':
        grey(10);
        put(b.text, L, y);
        y += 6;
        break;
      case 'h2':
        ensure(14);
        y += 4;
        doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(30, 41, 59);
        put(b.text, L, y);
        if (b.columns && shared) {
          grey(8.5);
          put('Apartment total', MID, y, { align: 'right' });
          put(`Your share ${pctText(share.sharePct)}`, R, y, { align: 'right' });
        }
        y += 2;
        doc.setDrawColor(203, 213, 225).line(L, y, R, y);
        y += 6;
        break;
      case 'row':
        ensure(7);
        ink(!!b.bold);
        put(b.left, L, y);
        put(b.right, R, y, { align: 'right' });
        y += 6;
        break;
      case 'amount':
        ensure(7);
        ink(!!b.bold);
        put(b.left, L, y);
        if (shared) {
          doc.setTextColor(100, 116, 139);
          put(money(b.total), MID, y, { align: 'right' });
          doc.setTextColor(30, 41, 59);
        }
        put(money(b.mine), R, y, { align: 'right' });
        y += 6;
        break;
      case 'form':
        ensure(12);
        ink(!!b.bold);
        put(b.ref, L, y);
        put(b.label, L + 11, y);
        put(money(b.value), R, y, { align: 'right' });
        y += 4.6;
        grey(8);
        put(b.fi, L + 11, y);
        y += 5;
        break;
      case 'part':
        ensure(5.5);
        grey(8.5);
        put(`of which ${b.label}`, L + 11, y);
        put(money(b.value), R, y, { align: 'right' });
        y += 5;
        break;
      case 'small': {
        const lines = doc.splitTextToSize(b.text, R - L) as string[];
        ensure(lines.length * 4.5 + 2);
        grey(8.5);
        put(lines, L, y);
        y += lines.length * 4.5 + 2;
        break;
      }
    }
  }

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
