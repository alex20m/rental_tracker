import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { CATEGORIES } from './types';
import type { DB } from './types';
import { computeTax, MONTHS } from './tax';
import type { TaxResult } from './tax';
import { loadReceipt } from './store';

// jsPDF's built-in fonts can't render the € glyph reliably, so amounts use "EUR".
const money = (n: number) =>
  new Intl.NumberFormat('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR';

export function buildPdf(db: DB, t: TaxResult): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const s = db.settings;
  const W = 210;
  const L = 18;
  const R = W - 18;
  let y = 20;

  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 20;
    }
  };
  const h1 = (txt: string) => {
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(15, 118, 110).text(txt, L, y);
    y += 8;
  };
  const h2 = (txt: string) => {
    ensure(14);
    y += 4;
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(30, 41, 59).text(txt, L, y);
    y += 2;
    doc.setDrawColor(203, 213, 225).line(L, y, R, y);
    y += 6;
  };
  const row = (left: string, right: string, bold = false) => {
    ensure(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(10).setTextColor(30, 41, 59);
    doc.text(left, L, y);
    doc.text(right, R, y, { align: 'right' });
    y += 6;
  };
  const small = (txt: string) => {
    const lines = doc.splitTextToSize(txt, R - L) as string[];
    ensure(lines.length * 4.5 + 2);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(100, 116, 139).text(lines, L, y);
    y += lines.length * 4.5 + 2;
  };

  h1(`Rental income & expenses ${t.year}`);
  doc
    .setFont('helvetica', 'normal')
    .setFontSize(10)
    .setTextColor(100, 116, 139)
    .text('Vuokratulot ja -menot (summary for tax form 9 / OmaVero)', L, y);
  y += 6;

  h2('Taxpayer & property');
  row('Taxpayer', s.taxpayerName || '—');
  row('Property', s.propertyName || '—');
  row('Address', s.address || '—');
  row('Housing company', s.housingCompany || '—');
  row('Purchased', s.purchaseDate ? `${s.purchaseDate} for ${money(s.purchasePrice)}` : '—');

  h2('Income (Vuokratulot)');
  const monthly = Array(12).fill(0) as number[];
  for (const r of db.rents) {
    if (r.status === 'paid' && r.receivedDate.startsWith(String(t.year))) {
      monthly[Number(r.receivedDate.slice(5, 7)) - 1] += r.amount;
    }
  }
  monthly.forEach((v, i) => {
    if (v) row(`${MONTHS[i]} ${t.year}`, money(v));
  });
  row('Total rent received', money(t.rentIncome), true);
  small(
    `Months paid: ${t.paidMonths} · vacant: ${t.vacantMonths} · unpaid: ${t.unpaidMonths}. ` +
      `Rent is reported in the year it was received.`,
  );

  h2('Expenses (Vähennyskelpoiset menot)');
  for (const l of t.lines.filter((l) => l.deductible)) row(`${l.label} (${l.fi})`, money(l.amount));
  row('Total deductible expenses', money(t.deductibleCosts), true);
  if (t.depreciation) {
    row('Depreciation (Poisto)', money(t.depreciation));
    small(
      `${s.depreciationRate}% reducing balance on ${money((s.purchasePrice * s.buildingSharePct) / 100)} ` +
        `depreciable cost, less ${money(s.depreciationPrior)} already depreciated.`,
    );
  }
  const nd = t.lines.filter((l) => !l.deductible);
  if (nd.length) {
    y += 2;
    for (const l of nd) row(`Not deductible: ${l.label} (${l.fi})`, money(l.amount));
    small('Financing charges are not an expense; they increase the acquisition cost of the shares.');
  }

  h2('Result');
  row('Rent income', money(t.rentIncome));
  row('− Deductible expenses', money(t.deductibleCosts));
  row('− Depreciation', money(t.depreciation));
  row(t.netIncome >= 0 ? 'Taxable rental income (Pääomatulo)' : 'Rental loss (Alijäämä)', money(t.netIncome), true);
  row('Estimated capital income tax', money(t.estimatedTax), true);
  small(
    'Estimate only: 30% on capital income up to 30 000 EUR and 34% above, before any other capital income or ' +
      'deductions. Verify the figures and current rules on vero.fi before filing.',
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(148, 163, 184);
    doc.text(`Generated ${new Date().toISOString().slice(0, 10)} by Rental Tracker — page ${p}/${pages}`, L, 290);
  }
  return doc.output('blob');
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function buildCsv(db: DB, year: number, receiptNames: Map<string, string>): string {
  const y = String(year);
  const rows: (string | number)[][] = [['date', 'type', 'category', 'description', 'amount_eur', 'receipt_file']];
  for (const r of db.rents.filter((r) => r.month.startsWith(y) || r.receivedDate.startsWith(y))) {
    rows.push([r.receivedDate || r.month, 'rent', r.status, `Rent for ${r.month}${r.note ? ' – ' + r.note : ''}`, r.amount, '']);
  }
  for (const c of db.costs.filter((c) => c.date.startsWith(y))) {
    rows.push([c.date, 'cost', CATEGORIES[c.category].label, c.description, -c.amount, receiptNames.get(c.id) ?? '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** Zip: declaration PDF + ledger CSV + JSON summary + all receipt images for the year. */
export async function buildPackage(db: DB, year: number): Promise<Blob> {
  const t = computeTax(db, year);
  const zip = new JSZip();
  zip.file(`vuokratulot-ja-menot-${year}.pdf`, buildPdf(db, t));

  const names = new Map<string, string>();
  const folder = zip.folder('receipts')!;
  for (const c of db.costs.filter((c) => c.date.startsWith(String(year)) && c.hasReceipt)) {
    const data = await loadReceipt(c.id);
    if (!data) continue;
    const safe = c.description.replace(/[^a-z0-9]+/gi, '-').slice(0, 30).replace(/^-|-$/g, '') || c.category;
    const name = `${c.date}_${safe}_${c.id}.jpg`;
    folder.file(name, data.split(',')[1], { base64: true });
    names.set(c.id, `receipts/${name}`);
  }
  zip.file(`ledger-${year}.csv`, buildCsv(db, year, names));
  zip.file(`summary-${year}.json`, JSON.stringify(t, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
