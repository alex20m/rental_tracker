import { CATEGORIES } from './types';
import type { ApartmentView, CostCategory } from './types';
import { declarationFigures, tenancyPeriod } from './forms';
import type { DeclarationFigures, OtherPart } from './forms';
import { improvementPart, improvementYears, movableDetail, round2 } from './tax';
import type { OwnerShare, TaxResult } from './tax';
import { deductionOf } from './tax';
import { rulesFor } from './taxRules';
import { translator } from '@/lib/i18n';
import type { MessageKey, Translator } from '@/lib/i18n';

/**
 * What the declaration PDF says, as blocks. For a flat in a housing company it
 * follows the screens of OmaVero in order, with the names of its fields, in the
 * reader's language; for a property of one's own it follows form 7K, in English
 * with the form's Finnish words. The drawing code only lays these out; every
 * decision about what to say and which number goes where is made here, where it
 * is tested.
 */
export type PdfBlock =
  | { type: 'h1'; text: string }
  | { type: 'subtitle'; text: string }
  /** `columns` names the two amount columns of the blocks under it, when the apartment is shared; `newPage` starts a page. */
  | { type: 'h2'; text: string; columns?: { total: string; mine: string }; newPage?: boolean }
  /** Plain label and value. */
  | { type: 'row'; left: string; right: string; bold?: boolean }
  /** An amount for the apartment and the owner's part of it; drawn as two columns when the apartment is shared. */
  | { type: 'amount'; left: string; total: number; mine: number; bold?: boolean }
  /** A field of OmaVero's form, by the name it has there, and the amount to type into it. */
  | { type: 'field'; label: string; value: number; bold?: boolean }
  /** A numbered row of form 7K: the number, what it is, the form's own Finnish words, the amount to enter. */
  | { type: 'form'; ref: string; label: string; fi: string; value: number; bold?: boolean }
  /** One of the things a field or row is made of; the label says so itself ("of which …"). */
  | { type: 'part'; label: string; value: number }
  | { type: 'small'; text: string };

const fi = new Intl.NumberFormat('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `${fi.format(n)} EUR`;
const percentText = (n: number) => `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(n)} %`;
/** 30000 → "30 000", 0.27 → "0.27". */
const plain = (n: number) => String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** The amounts the reader sees under the names of the cost categories, in the reader's language. */
const categoryLabel = (m: Translator['t'], category: CostCategory) => m(`cat.${category}.label` as MessageKey);

const OTHER_PART_KEYS = { improvements: 'pdf.part.improvements', furniture: 'pdf.part.furniture', flatRate: 'pdf.part.flatRate' } as const;

/** A part of "Other expenses" on OmaVero's form, in the reader's language. */
const flatPartLabel = (m: Translator['t'], p: OtherPart) =>
  m('pdf.of', { what: p.kind === 'category' ? categoryLabel(m, p.category) : m(OTHER_PART_KEYS[p.kind]) });

/** A part of a row of form 7K, which keeps the form's own Finnish words beside the English. */
const propertyPartLabel = (p: OtherPart) =>
  p.kind === 'category'
    ? `of which ${CATEGORIES[p.category].label} (${CATEGORIES[p.category].fi})`
    : { improvements: "of which Basic improvements, this year's part (Perusparannusten poistot)", furniture: "of which Furniture & appliances, this year's part (Irtaimiston poistot)", flatRate: 'of which Furnished flat, flat-rate deduction (Kalustevähennys)' }[p.kind];

const monthName = (lang: string, month: number) =>
  new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month, 1)));

export function declarationModel(apt: ApartmentView, t: TaxResult, share: OwnerShare, taxpayerName: string, tr: Translator): PdfBlock[] {
  return apt.settings.propertyType === 'property'
    ? propertyModel(apt, t, share, taxpayerName)
    : flatModel(apt, t, share, taxpayerName, tr);
}

/** Who owns the apartment, when it is shared: each owner files their own part. */
function sharedNote(apt: ApartmentView, share: OwnerShare, tr: Translator): PdfBlock[] {
  if (share.sharePct === 100) return [];
  return [
    {
      type: 'small',
      text: tr.t('pdf.shared', {
        owners: tr.tn('pdf.owners', apt.owners.length),
        pending: apt.invites.length ? tr.t('pdf.pending', { n: apt.invites.length }) : '',
      }),
    },
  ];
}

/** Rows about how the home was let, which only differ from the usual in the less common cases. */
function lettingRows(apt: ApartmentView, tr: Translator): PdfBlock[] {
  const s = apt.settings;
  const out: PdfBlock[] = [];
  if (s.letSharePct !== 100) out.push({ type: 'row', left: tr.t('pdf.flat.letShare'), right: percentText(s.letSharePct) });
  if (s.belowMarketRent) out.push({ type: 'row', left: tr.t('pdf.flat.rent'), right: tr.t('pdf.flat.belowMarket') });
  return out;
}

/**
 * A flat in a housing company, in the order of OmaVero: where to click, the
 * flat, the fields of "rental income and expenses", the interest, and the
 * sending. What follows is for the owner's own papers.
 */
function flatModel(apt: ApartmentView, t: TaxResult, share: OwnerShare, taxpayerName: string, tr: Translator): PdfBlock[] {
  const m = tr.t;
  const s = apt.settings;
  const year = t.year;
  const f = declarationFigures('7H', share, apt);
  const out: PdfBlock[] = [];
  const add = (...blocks: PdfBlock[]) => out.push(...blocks);

  add(
    { type: 'h1', text: m('pdf.title', { year }) },
    { type: 'subtitle', text: `${taxpayerName} · ${s.name}` },
    { type: 'small', text: m('pdf.intro') },

    { type: 'h2', text: m('pdf.step.open') },
    { type: 'small', text: m('pdf.open.path', { year }) },
    { type: 'small', text: m('pdf.open.prefilled') },

    { type: 'h2', text: m('pdf.step.flat') },
    { type: 'row', left: m('pdf.flat.kind'), right: m('pdf.flat.kindValue') },
    { type: 'row', left: m('pdf.flat.company'), right: s.housingCompany || '—' },
    { type: 'row', left: m('pdf.flat.flat'), right: s.address || s.name },
    { type: 'row', left: m('pdf.flat.share'), right: percentText(share.sharePct) },
    { type: 'row', left: m('pdf.flat.period'), right: tenancyPeriod(apt.rents, year) || '—' },
    ...lettingRows(apt, tr),
    { type: 'small', text: m('pdf.flat.tenants') },
    ...sharedNote(apt, share, tr),

    { type: 'h2', text: m('pdf.step.income') },
    { type: 'field', label: m('pdf.field.rent'), value: f.gross },
    { type: 'field', label: m('pdf.field.maintenance'), value: f.maintenanceAndWater },
    { type: 'field', label: m('pdf.field.financing'), value: f.financing },
    { type: 'field', label: m('pdf.field.repairs'), value: f.repairs },
    { type: 'field', label: m('pdf.field.other'), value: f.other },
    ...f.otherParts.map((p): PdfBlock => ({ type: 'part', label: flatPartLabel(m, p), value: p.amount })),
  );
  if (f.limitReduction > 0) {
    add(
      { type: 'field', label: m('pdf.reduce'), value: f.limitReduction, bold: true },
      { type: 'small', text: m('pdf.reduceNote') },
    );
  }
  add(
    { type: 'small', text: m('pdf.fieldNote') },

    { type: 'h2', text: m('pdf.step.interest') },
  );
  if (f.interest > 0) add({ type: 'field', label: m('pdf.field.interest'), value: f.interest });
  else add({ type: 'small', text: m('pdf.interest.none') });
  add(
    { type: 'small', text: m('pdf.interest.note') },

    { type: 'h2', text: m('pdf.step.send') },
    { type: 'small', text: m('pdf.send.note') },
    ...records(apt, t, share, tr),
  );
  return out;
}

/** A property of one's own: form 7K, laid out with its own numbers, in English. */
function propertyModel(apt: ApartmentView, t: TaxResult, share: OwnerShare, taxpayerName: string): PdfBlock[] {
  const tr = translator('en');
  const s = apt.settings;
  const year = t.year;
  const rules = rulesFor(year);
  const f = declarationFigures('7K', share, apt);
  const out: PdfBlock[] = [];
  const add = (...blocks: PdfBlock[]) => out.push(...blocks);

  add(
    { type: 'h1', text: `Rental income & expenses ${year}` },
    { type: 'subtitle', text: 'Vuokratulot ja -menot (figures for tax form 7K / OmaVero)' },
    { type: 'h2', text: 'Taxpayer & property' },
    { type: 'row', left: 'Taxpayer', right: taxpayerName },
    { type: 'row', left: 'Ownership share', right: percentText(share.sharePct) },
    { type: 'row', left: 'Property', right: s.name },
    { type: 'row', left: 'Address', right: s.address || '—' },
    { type: 'row', left: 'Purchased', right: s.purchaseDate ? `${s.purchaseDate} for ${money(s.purchasePrice)}` : '—' },
    { type: 'row', left: 'Let during', right: tenancyPeriod(apt.rents, year) || '—' },
    ...lettingRows(apt, tr),
    ...sharedNote(apt, share, tr),
    ...form7K(f, rules.movable.rate),
  );
  if (f.limitReduction > 0) {
    add(
      { type: 'row', left: 'Reduce the rows above by', right: money(f.limitReduction), bold: true },
      {
        type: 'small',
        text: 'The rent is below the usual rent, so the deductions together may not exceed the rent: take this amount off the rows, wherever it suits you.',
      },
    );
  }
  const interest = t.lines.filter((l) => l.deductible && CATEGORIES[l.category].treatment === 'interest');
  if (interest.length) {
    add({ type: 'h2', text: 'Declared separately (not on the rental form)', columns: columnsOf(share, tr) });
    for (const l of interest) {
      add({ type: 'amount', left: `${l.label} (${l.fi})`, total: l.amount, mine: share.lines.find((x) => x.category === l.category)!.amount });
    }
    add({ type: 'small', text: 'Interest on a loan for the rental property is declared with the interest deductions in OmaVero.' });
  }
  add(...records(apt, t, share, tr));
  return out;
}

const columnsOf = (share: OwnerShare, tr: Translator) =>
  share.sharePct === 100 ? undefined : { total: tr.t('pdf.colTotal'), mine: tr.t('pdf.colMine', { pct: percentText(share.sharePct) }) };

/** What the owner keeps for themselves: the income month by month, what was not deducted, the result, and the lists the law asks for. */
function records(apt: ApartmentView, t: TaxResult, share: OwnerShare, tr: Translator): PdfBlock[] {
  const m = tr.t;
  const s = apt.settings;
  const year = t.year;
  const rules = rulesFor(year);
  const columns = columnsOf(share, tr);
  const out: PdfBlock[] = [];
  const add = (...blocks: PdfBlock[]) => out.push(...blocks);
  const mine = (category: CostCategory) => share.lines.find((l) => l.category === category)!.amount;

  // — income, month by month —
  add({ type: 'h2', text: m('pdf.records'), newPage: true }, { type: 'h2', text: m('pdf.income'), columns });
  const monthly = Array(12).fill(0) as number[];
  for (const r of apt.rents) {
    if (r.status === 'paid' && r.receivedDate.startsWith(String(year))) {
      monthly[Number(r.receivedDate.slice(5, 7)) - 1]! += r.amount;
    }
  }
  monthly.forEach((v, i) => {
    if (v) add({ type: 'amount', left: `${monthName(tr.lang, i)} ${year}`, total: v, mine: round2((v * share.sharePct) / 100) });
  });
  add(
    { type: 'amount', left: m('pdf.rentTotal'), total: t.rentIncome, mine: share.rentIncome, bold: true },
    { type: 'small', text: m('pdf.months', { paid: t.paidMonths, vacant: t.vacantMonths, unpaid: t.unpaidMonths }) },
  );

  // — what is not deducted —
  const notDeductible = t.lines.filter((l) => !l.deductible);
  if (notDeductible.length) {
    add({ type: 'h2', text: m('pdf.notDeducted') });
    for (const l of notDeductible) {
      const reason = (['financing_charge', 'furniture', 'loan_interest'] as const).find((c) => c === l.category);
      add(
        { type: 'amount', left: m('pdf.notDeductible', { what: categoryLabel(m, l.category) }), total: l.amount, mine: mine(l.category) },
        { type: 'small', text: m(reason ? `pdf.reason.${reason}` : 'pdf.reason.other') },
      );
    }
  }

  // — the result —
  add(
    { type: 'h2', text: m('pdf.result'), columns },
    { type: 'amount', left: m('pdf.result.rent'), total: t.rentIncome, mine: share.rentIncome },
    { type: 'amount', left: m('pdf.result.costs'), total: t.deductibleCosts, mine: share.deductibleCosts },
    { type: 'amount', left: m('pdf.result.depreciation'), total: t.depreciation, mine: share.depreciation },
  );
  if (t.limitAdjustment > 0) {
    add({ type: 'amount', left: m('pdf.result.limit'), total: t.limitAdjustment, mine: share.limitAdjustment });
  }
  add(
    {
      type: 'amount',
      left: share.netIncome >= 0 ? m('pdf.result.income') : m('pdf.result.loss'),
      total: t.netIncome,
      mine: share.netIncome,
      bold: true,
    },
    { type: 'row', left: m('pdf.result.tax'), right: money(share.estimatedTax), bold: true },
  );
  if (share.deficitCredit > 0) add({ type: 'row', left: m('pdf.result.credit'), right: money(share.deficitCredit), bold: true });
  const { lowRate, highRate, limit } = rules.capitalIncome;
  add({
    type: 'small',
    text: [
      m('pdf.result.estimate', { low: plain(lowRate * 100), high: plain(highRate * 100), limit: plain(limit) }),
      share.deficitCredit > 0
        ? m('pdf.result.creditNote', { rate: plain(rules.deficitCredit.rate * 100), max: plain(rules.deficitCredit.max) })
        : '',
      m('pdf.result.verify'),
    ]
      .filter(Boolean)
      .join(' '),
  });

  // — lists the law asks the owner to keep —
  const running = apt.costs.filter((c) => deductionOf(c, s) === 'improvement' && improvementPart(c, year) > 0);
  if (running.length) {
    add({ type: 'h2', text: m('pdf.improvements') });
    for (const c of running) {
      add({
        type: 'row',
        left: m('pdf.improvements.row', {
          date: c.date,
          what: c.description || categoryLabel(m, c.category),
          amount: money(c.amount),
          years: improvementYears(c),
        }),
        right: m('pdf.improvements.thisYear', { amount: money(improvementPart(c, year)) }),
      });
    }
    add({ type: 'small', text: m('pdf.improvements.note') });
  }
  const inventory = movableDetail(apt, year);
  if (inventory.items.length) {
    add({ type: 'h2', text: m('pdf.inventory') });
    for (const i of inventory.items) {
      add(
        {
          type: 'row',
          left: m('pdf.inventory.row', { date: i.date, what: i.description || m('pdf.inventory.furniture'), price: money(i.price) }),
          right: m('pdf.improvements.thisYear', { amount: money(i.part) }),
        },
        { type: 'small', text: m('pdf.inventory.left', { start: money(i.start), end: money(i.end) }) },
      );
    }
    add({ type: 'small', text: m('pdf.inventory.note', { limit: plain(rules.movable.atOnceLimit), rate: plain(rules.movable.rate * 100) }) });
  }

  add({ type: 'small', text: m('pdf.keep', { years: rules.recordKeepingYears }) });
  return out;
}

function form7K(f: DeclarationFigures, movableRate: number): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { type: 'h2', text: 'Form 7K - Hyresinkomster - fastighet (Vuokratulot - kiinteistö), your share' },
    { type: 'form', ref: '2', label: 'Gross rent received (your share)', fi: 'Oma osuutesi bruttovuokratuloista / vuosi', value: f.gross },
    { type: 'form', ref: '3.1', label: 'Annual repairs', fi: 'Vuosikorjauskulut', value: f.repairs },
    { type: 'form', ref: '3.2', label: 'Other costs of the letting', fi: 'Muut vuokratuloon kohdistuvat kulut', value: f.other },
    ...f.otherParts.map((p): PdfBlock => ({ type: 'part', label: propertyPartLabel(p), value: p.amount })),
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
