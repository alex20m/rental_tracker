import { CATEGORIES } from './types';
import type { ApartmentView, CostCategory } from './types';
import { declarationFigures, tenancyPeriod } from './forms';
import type { DeclarationFigures, OtherPart } from './forms';
import { improvementPart, improvementYears, movableDetail } from './tax';
import type { OwnerShare, TaxResult } from './tax';
import { deductionOf } from './tax';
import { rulesFor } from './taxRules';

/**
 * What the declaration PDF says, as blocks in the order of the Finnish forms.
 * The drawing code only lays these out; every decision about what to say and
 * which number goes on which row is made here, where it is tested.
 */
export type PdfBlock =
  | { type: 'h1'; text: string }
  | { type: 'subtitle'; text: string }
  | { type: 'h2'; text: string; columns?: boolean }
  /** Plain label and value. */
  | { type: 'row'; left: string; right: string; bold?: boolean }
  /** An amount for the apartment and the owner's part of it; drawn as two columns when the apartment is shared. */
  | { type: 'amount'; left: string; total: number; mine: number; bold?: boolean }
  /** A numbered row of the form: the number, what it is, the form's own Finnish words, the amount to enter. */
  | { type: 'form'; ref: string; label: string; fi: string; value: number; bold?: boolean }
  /** One of the things a form row is made of. */
  | { type: 'part'; label: string; value: number }
  | { type: 'small'; text: string };

const fi = new Intl.NumberFormat('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `${fi.format(n)} EUR`;
const percentText = (n: number) => `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(n)} %`;
/** 30000 → "30 000", 0.27 → "0.27": the PDF is English. */
const plain = (n: number) => String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OTHER_PART_LABELS = {
  improvements: "Basic improvements, this year's part (Perusparannusten poistot)",
  furniture: "Furniture & appliances, this year's part (Irtaimiston poistot)",
  flatRate: 'Furnished flat, flat-rate deduction (Kalustevähennys)',
} as const;

const partLabel = (p: OtherPart) =>
  p.kind === 'category' ? `${CATEGORIES[p.category].label} (${CATEGORIES[p.category].fi})` : OTHER_PART_LABELS[p.kind];

const NOT_DEDUCTIBLE_REASONS: Partial<Record<CostCategory, string>> = {
  financing_charge: 'A financing charge the housing company funds is not an expense; it increases the acquisition cost of the shares.',
  furniture: 'Covered by the flat-rate deduction for a furnished flat.',
  loan_interest: 'Interest on the loan is not deductible when the rent is below the usual rent.',
};

export function declarationModel(apt: ApartmentView, t: TaxResult, share: OwnerShare, taxpayerName: string): PdfBlock[] {
  const s = apt.settings;
  const year = t.year;
  const rules = rulesFor(year);
  const form = s.propertyType === 'property' ? '7K' : '7H';
  const f = declarationFigures(form, share, apt);
  const shared = share.sharePct !== 100;
  const out: PdfBlock[] = [];
  const add = (...blocks: PdfBlock[]) => out.push(...blocks);

  add(
    { type: 'h1', text: `Rental income & expenses ${year}` },
    { type: 'subtitle', text: `Vuokratulot ja -menot (figures for tax form ${form} / OmaVero)` },
    { type: 'h2', text: 'Taxpayer & property' },
    { type: 'row', left: 'Taxpayer', right: taxpayerName },
    { type: 'row', left: 'Ownership share', right: percentText(share.sharePct) },
    { type: 'row', left: 'Property', right: s.name },
    { type: 'row', left: 'Address', right: s.address || '—' },
    { type: 'row', left: 'Housing company', right: s.housingCompany || '—' },
    { type: 'row', left: 'Purchased', right: s.purchaseDate ? `${s.purchaseDate} for ${money(s.purchasePrice)}` : '—' },
    { type: 'row', left: 'Let during', right: tenancyPeriod(apt.rents, year) || '—' },
  );
  if (s.letSharePct !== 100) add({ type: 'row', left: 'Share of the home that is let', right: percentText(s.letSharePct) });
  if (s.belowMarketRent) add({ type: 'row', left: 'Rent', right: 'below the usual rent' });
  if (shared) {
    add({
      type: 'small',
      text:
        `The apartment has ${apt.owners.length} owner${apt.owners.length === 1 ? '' : 's'}` +
        `${apt.invites.length ? ` and ${apt.invites.length} pending` : ''}. Each owner declares their own share of ` +
        'the income and expenses; the right-hand column is yours.',
    });
  }

  // — income, month by month —
  add({ type: 'h2', text: 'Income (Vuokratulot)', columns: true });
  const monthly = Array(12).fill(0) as number[];
  for (const r of apt.rents) {
    if (r.status === 'paid' && r.receivedDate.startsWith(String(year))) {
      monthly[Number(r.receivedDate.slice(5, 7)) - 1]! += r.amount;
    }
  }
  monthly.forEach((v, i) => {
    if (v) add({ type: 'amount', left: `${MONTHS[i]} ${year}`, total: v, mine: Math.round(v * share.sharePct) / 100 });
  });
  add(
    { type: 'amount', left: 'Total rent received', total: t.rentIncome, mine: share.rentIncome, bold: true },
    {
      type: 'small',
      text:
        `Months paid: ${t.paidMonths} · vacant: ${t.vacantMonths} · unpaid: ${t.unpaidMonths}. ` +
        'Rent is reported in the year it was received.',
    },
  );

  // — the form —
  if (form === '7H') add(...form7H(f));
  else add(...form7K(f, rules.movable.rate));
  if (f.limitReduction > 0) {
    add(
      { type: 'row', left: 'Reduce the rows above by', right: money(f.limitReduction), bold: true },
      {
        type: 'small',
        text: 'The rent is below the usual rent, so the deductions together may not exceed the rent: take this amount off the rows, wherever it suits you.',
      },
    );
  }

  // — loan interest, and what is not deducted —
  const interest = t.lines.filter((l) => l.deductible && CATEGORIES[l.category].treatment === 'interest');
  if (interest.length) {
    add({ type: 'h2', text: 'Declared separately (not on the rental form)', columns: true });
    for (const l of interest) {
      add({ type: 'amount', left: `${l.label} (${l.fi})`, total: l.amount, mine: share.lines.find((m) => m.category === l.category)!.amount });
    }
    add({ type: 'small', text: 'Interest on a loan for the rental property is declared with the interest deductions in OmaVero.' });
  }
  const notDeductible = t.lines.filter((l) => !l.deductible);
  if (notDeductible.length) {
    add({ type: 'h2', text: 'Not deducted' });
    for (const l of notDeductible) {
      add(
        { type: 'amount', left: `Not deductible: ${l.label} (${l.fi})`, total: l.amount, mine: share.lines.find((m) => m.category === l.category)!.amount },
        { type: 'small', text: NOT_DEDUCTIBLE_REASONS[l.category] ?? 'This cost is not deductible.' },
      );
    }
  }

  // — the result —
  add(
    { type: 'h2', text: 'Result', columns: true },
    { type: 'amount', left: 'Rent income', total: t.rentIncome, mine: share.rentIncome },
    { type: 'amount', left: '- Deductible expenses', total: t.deductibleCosts, mine: share.deductibleCosts },
    { type: 'amount', left: '- Depreciation', total: t.depreciation, mine: share.depreciation },
  );
  if (t.limitAdjustment > 0) {
    add({ type: 'amount', left: '+ Deductions above the rent (not allowed)', total: t.limitAdjustment, mine: share.limitAdjustment });
  }
  add(
    {
      type: 'amount',
      left: share.netIncome >= 0 ? 'Taxable rental income (Pääomatulo)' : 'Rental loss (Alijäämä)',
      total: t.netIncome,
      mine: share.netIncome,
      bold: true,
    },
    { type: 'row', left: 'Estimated capital income tax on your share', right: money(share.estimatedTax), bold: true },
  );
  if (share.deficitCredit > 0) {
    add({ type: 'row', left: 'Deficit credit, up to', right: money(share.deficitCredit), bold: true });
  }
  const { lowRate, highRate, limit } = rules.capitalIncome;
  add({
    type: 'small',
    text:
      `Estimate only: ${plain(lowRate * 100)}% on capital income up to ${plain(limit)} EUR and ${plain(highRate * 100)}% above, ` +
      'before any other capital income or deductions. ' +
      (share.deficitCredit > 0
        ? `The deficit credit (alijäämähyvitys) is ${plain(rules.deficitCredit.rate * 100)}% of the deficit, at most ${plain(rules.deficitCredit.max)} EUR ` +
          '(more with minor children), taken off the tax on earned income; it also depends on your other capital income. '
        : '') +
      'Verify the figures and current rules on vero.fi before filing.',
  });

  // — records the law asks for —
  const running = apt.costs.filter((c) => deductionOf(c, s) === 'improvement' && improvementPart(c, year) > 0);
  if (running.length) {
    add({ type: 'h2', text: 'Basic improvements deducted over several years (keep with your records)' });
    for (const c of running) {
      add({
        type: 'row',
        left: `${c.date} ${c.description || CATEGORIES[c.category].label} (${money(c.amount)} over ${improvementYears(c)} years)`,
        right: `${money(improvementPart(c, year))} this year`,
      });
    }
    add({ type: 'small', text: 'Each is deducted in equal parts, starting the year it was paid. Amounts are for the whole apartment.' });
  }
  const inventory = movableDetail(apt, year);
  if (inventory.items.length) {
    add({ type: 'h2', text: 'Inventory of furniture and appliances (keep with your records)' });
    for (const i of inventory.items) {
      add(
        { type: 'row', left: `${i.date} ${i.description || 'Furniture'} (price ${money(i.price)})`, right: `${money(i.part)} this year` },
        { type: 'small', text: `Left at the start of the year ${money(i.start)}, at the end ${money(i.end)}.` },
      );
    }
    add({
      type: 'small',
      text: `Items over ${plain(rules.movable.atOnceLimit)} EUR: ${plain(rules.movable.rate * 100)}% of what is left a year. Amounts are for the whole apartment.`,
    });
  }

  add({
    type: 'small',
    text: `Keep this declaration, your notes and the receipts for ${rules.recordKeepingYears} years; do not send them unless the Tax Administration asks.`,
  });
  return out;
}

function form7H(f: DeclarationFigures): PdfBlock[] {
  return [
    { type: 'h2', text: 'Form 7H - Hyresinkomster - aktielägenheter (Vuokratulot - osakehuoneistot), your share' },
    { type: 'form', ref: '2.1', label: 'Rent for the whole year, gross', fi: 'Vuokratulojen määrä koko vuonna (oma osuus, brutto)', value: f.gross },
    { type: 'form', ref: '2.2', label: 'Maintenance charges and water charges', fi: 'Hoitovastikkeet ja vesimaksut (oma osuus)', value: f.maintenanceAndWater },
    { type: 'form', ref: '2.3', label: 'Financing charges booked as income by the company', fi: 'Yhtiön tulouttamat pääomavastikkeet (oma osuus)', value: f.financing },
    { type: 'form', ref: '2.4', label: 'Annual repairs', fi: 'Vuosikorjausten kulut (oma osuus)', value: f.repairs },
    { type: 'form', ref: '2.5', label: 'Other expenses', fi: 'Muut kulut (oma osuus)', value: f.other },
    ...f.otherParts.map((p): PdfBlock => ({ type: 'part', label: partLabel(p), value: p.amount })),
  ];
}

function form7K(f: DeclarationFigures, movableRate: number): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { type: 'h2', text: 'Form 7K - Hyresinkomster - fastighet (Vuokratulot - kiinteistö), your share' },
    { type: 'form', ref: '2', label: 'Gross rent received (your share)', fi: 'Oma osuutesi bruttovuokratuloista / vuosi', value: f.gross },
    { type: 'form', ref: '3.1', label: 'Annual repairs', fi: 'Vuosikorjauskulut', value: f.repairs },
    { type: 'form', ref: '3.2', label: 'Other costs of the letting', fi: 'Muut vuokratuloon kohdistuvat kulut', value: f.other },
    ...f.otherParts.map((p): PdfBlock => ({ type: 'part', label: partLabel(p), value: p.amount })),
    { type: 'form', ref: '3.3', label: "This year's depreciation (from 4.5)", fi: 'Verovuoden poisto (kohdasta 4.5)', value: f.depreciation },
    {
      type: 'form',
      ref: '3.4',
      label: 'Taxable rental income, net (when positive)',
      fi: 'Verotettava vuokratulo / vuosi, netto',
      value: Math.max(f.netBeforeInterest, 0),
      bold: true,
    },
    {
      type: 'form',
      ref: '3.5',
      label: 'Loss from letting, net (when negative)',
      fi: 'Vuokraustoiminnan tappio / vuosi, netto',
      value: Math.max(-f.netBeforeInterest, 0),
      bold: true,
    },
  ];
  const b = f.buildingRows;
  if (b) {
    blocks.push(
      { type: 'small', text: `Depreciation of the building (Poiston laskenta), your share, at ${plain(b.rate)}%:` },
      { type: 'form', ref: '4.1', label: "The let building's part of the acquisition price", fi: 'Vuokratun rakennuksen tai omaisuuden osuus kiinteistön hankintahinnasta', value: b.cost },
      { type: 'form', ref: '4.2', label: 'Unwritten-off cost at the start of the year', fi: 'Poistamaton hankintameno verovuoden alussa', value: b.start },
      { type: 'form', ref: '4.3', label: 'Additions during the year (improvements)', fi: 'Lisäykset verovuonna', value: b.added },
      { type: 'form', ref: '4.4', label: 'Unwritten-off cost after additions', fi: 'Poistamaton hankintameno lisäysten jälkeen', value: b.base },
      { type: 'form', ref: '4.5', label: "This year's depreciation", fi: 'Verovuoden poisto', value: b.part },
      { type: 'form', ref: '4.6', label: 'Unwritten-off cost at the end of the year', fi: 'Poistamaton hankintameno verovuoden lopussa', value: b.end },
    );
  }
  const m = f.movableRows;
  if (m.base > 0 || m.part > 0) {
    blocks.push(
      { type: 'small', text: `Depreciation of loose property (Irtain omaisuus), your share, at ${plain(movableRate * 100)}%:` },
      { type: 'form', ref: '4.2', label: 'Unwritten-off cost at the start of the year', fi: 'Poistamaton hankintameno verovuoden alussa', value: m.start },
      { type: 'form', ref: '4.3', label: 'Additions during the year (items bought)', fi: 'Lisäykset verovuonna', value: m.added },
      { type: 'form', ref: '4.4', label: 'Unwritten-off cost after additions', fi: 'Poistamaton hankintameno lisäysten jälkeen', value: m.base },
      { type: 'form', ref: '4.5', label: "This year's depreciation", fi: 'Verovuoden poisto', value: m.part },
      { type: 'form', ref: '4.6', label: 'Unwritten-off cost at the end of the year', fi: 'Poistamaton hankintameno verovuoden lopussa', value: m.end },
    );
  }
  return blocks;
}
