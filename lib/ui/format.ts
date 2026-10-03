import type { Lang } from '@/lib/i18n';

const SHORT: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  sv: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  fi: ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'],
};

const LONG: Record<Lang, string[]> = {
  en: [
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
  ],
  sv: [
    'januari',
    'februari',
    'mars',
    'april',
    'maj',
    'juni',
    'juli',
    'augusti',
    'september',
    'oktober',
    'november',
    'december',
  ],
  fi: [
    'tammikuu',
    'helmikuu',
    'maaliskuu',
    'huhtikuu',
    'toukokuu',
    'kesäkuu',
    'heinäkuu',
    'elokuu',
    'syyskuu',
    'lokakuu',
    'marraskuu',
    'joulukuu',
  ],
};

/** The twelve month abbreviations, January first. */
export const monthsShort = (lang: Lang = 'en'): readonly string[] => SHORT[lang];

/** "2026-03-02" → "2 Mar" (Finnish: "2. maalis"). Empty for anything that is not a full ISO date. */
export function shortDate(iso: string, lang: Lang = 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const month = SHORT[lang][Number(m[2]) - 1];
  if (!month) return '';
  return lang === 'fi' ? `${Number(m[3])}. ${month}` : `${Number(m[3])} ${month}`;
}

/** "2026-03" → "March 2026". Anything else comes back untouched. */
export function monthTitle(month: string, lang: Lang = 'en'): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const name = m ? LONG[lang][Number(m[2]) - 1] : undefined;
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
