import { MONTHS } from '@/lib/domain/tax';

/** "2026-03-02" → "2 Mar". Empty for anything that is not a full ISO date. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : '';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-03" → "March 2026". Anything else comes back untouched. */
export function monthTitle(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const name = m ? MONTH_NAMES[Number(m[2]) - 1] : undefined;
  return m && name ? `${name} ${m[1]}` : month;
}

const whole = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/** Whole euros, for at-a-glance figures where cents are noise ("3 312 €"). */
export function eurWhole(n: number): string {
  return whole.format(Math.round(n) === 0 ? 0 : n);
}

/**
 * An amount in two pieces — the euros, and the decimal separator with the cents
 * and the currency sign — so the second can be set smaller. Together they read
 * exactly like `eur()`.
 */
export function moneyParts(n: number): { main: string; rest: string } {
  const parts = cents.formatToParts(n);
  const at = parts.findIndex((p) => p.type === 'decimal');
  if (at < 0) return { main: parts.map((p) => p.value).join(''), rest: '' };
  return {
    main: parts
      .slice(0, at)
      .map((p) => p.value)
      .join(''),
    rest: parts
      .slice(at)
      .map((p) => p.value)
      .join(''),
  };
}
