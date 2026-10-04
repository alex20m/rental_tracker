import { CATEGORIES } from './types';
import type { CostCategory, RentEntry } from './types';
import { depreciationDetail, movableDetail } from './tax';
import type { DepreciationDetail, OwnerShare } from './tax';
import { round2 } from './tax';
import type { Ledger } from './types';

/**
 * One owner's figures laid out as the Finnish forms ask for them: form 7H for a
 * flat in a housing company, form 7K for a property of one's own (OmaVero has the
 * same fields under other names, and no numbers). Everything is the owner's
 * share. docs/finnish-rental-tax-rules.md §12 lists the rows.
 */
export interface DeclarationFigures {
  form: '7H' | '7K';
  /** 2.1 / 2: the rent received in the year, gross. */
  gross: number;
  /** 2.2 (7H): maintenance charges and water charges. A property has no such row: they are in `other`. */
  maintenanceAndWater: number;
  /** 2.3 (7H): financing charges the company booked as income. */
  financing: number;
  /** 2.4 / 3.1: annual repairs. */
  repairs: number;
  /** 2.5 / 3.2: all other expenses, which `otherParts` lists. */
  other: number;
  otherParts: OtherPart[];
  /** 3.3 (7K): the year's depreciation of the building and of loose property. 0 on 7H, where it is in 2.5. */
  depreciation: number;
  /** Declared as interest on debts, not on the form. */
  interest: number;
  /** Rent below the usual: the rows above must come down by this much in total. */
  limitReduction: number;
  /** 3.4 (positive) / 3.5 (negative) on 7K; for 7H, what the rows leave. Before loan interest. */
  netBeforeInterest: number;
  /** 4.1–4.6 for the building, scaled to the share; null when not depreciated. */
  buildingRows: DepreciationDetail | null;
  /** 4.2–4.6 for loose property (25 %). */
  movableRows: { start: number; added: number; base: number; part: number; end: number };
}

export type OtherPart =
  | { kind: 'category'; category: CostCategory; amount: number }
  | { kind: 'improvements' | 'furniture' | 'flatRate'; amount: number };

/**
 * The owner's figures for the form. `ledger` is the apartment, for the depreciation
 * tables, which the owner's `share` cannot give; their share of it is applied here.
 */
export function declarationFigures(form: '7H' | '7K', share: OwnerShare, ledger?: Ledger): DeclarationFigures {
  const deductible = share.lines.filter((l) => l.deductible);
  const of = (...cats: CostCategory[]) => round2(deductible.filter((l) => cats.includes(l.category)).reduce((a, l) => a + l.amount, 0));
  const kind = (k: string) => share.depreciationLines.find((d) => d.kind === k)?.amount ?? 0;
  const isSeparate = (c: CostCategory) => CATEGORIES[c].treatment === 'interest';
  const otherCategories = deductible
    .filter((l) => !isSeparate(l.category) && l.category !== 'repairs' && !(form === '7H' && ['maintenance_charge', 'water_charge', 'financing_charge'].includes(l.category)))
    .map((l): OtherPart => ({ kind: 'category', category: l.category, amount: l.amount }));
  const depreciationParts: OtherPart[] = (form === '7H' ? (['improvements', 'furniture', 'flatRate'] as const) : (['flatRate'] as const))
    .map((k): OtherPart => ({ kind: k, amount: kind(k) }))
    .filter((p) => p.amount !== 0);
  const otherParts = [...otherCategories, ...depreciationParts];
  const interest = of('loan_interest');
  const scale = (n: number) => round2((n * share.sharePct) / 100);
  const detail = ledger ? depreciationDetail(ledger, share.year) : null;
  const movable = ledger ? movableDetail(ledger, share.year) : null;
  return {
    form,
    gross: share.rentIncome,
    maintenanceAndWater: form === '7H' ? of('maintenance_charge', 'water_charge') : 0,
    financing: form === '7H' ? of('financing_charge') : 0,
    repairs: of('repairs'),
    other: round2(otherParts.reduce((a, p) => a + p.amount, 0)),
    otherParts,
    depreciation: form === '7K' ? round2(kind('building') + kind('furniture') + kind('improvements')) : 0,
    interest,
    limitReduction: share.limitAdjustment,
    netBeforeInterest: round2(share.netIncome + interest),
    buildingRows: detail && {
      cost: scale(detail.cost),
      start: scale(detail.start),
      added: scale(detail.added),
      base: scale(detail.base),
      part: scale(detail.part),
      end: scale(detail.end),
      rate: detail.rate,
    },
    movableRows: {
      start: scale(movable?.start ?? 0),
      added: scale(movable?.added ?? 0),
      base: scale((movable?.start ?? 0) + (movable?.added ?? 0)),
      part: scale(movable?.part ?? 0),
      end: scale(movable?.end ?? 0),
    },
  };
}

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The period the flat was let, in the form's d.m.yyyy–d.m.yyyy: from the first
 * month the flat was let (rent paid or unpaid) to the last. When there were
 * several periods the form asks for the whole year instead. Empty when nothing
 * was let.
 */
export function tenancyPeriod(rents: RentEntry[], year: number): string {
  const months = rents
    .filter((r) => r.status !== 'vacant' && r.month.startsWith(`${year}-`))
    .map((r) => Number(r.month.slice(5, 7)))
    .sort((a, b) => a - b);
  if (months.length === 0) return '';
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const continuous = last - first + 1 === months.length;
  const [from, to] = continuous ? [first, last] : [1, 12];
  return `1.${from}.${year}–${lastDay(year, to)}.${to}.${year}`;
}
