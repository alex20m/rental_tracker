import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { fi } from '@/lib/i18n/fi';
import { sv } from '@/lib/i18n/sv';
import { LANGS, pickLang, translator, type Lang } from '@/lib/i18n';
import { buildChecklist } from '@/lib/domain/checklist';
import { computeTax } from '@/lib/domain/tax';
import { COST_CATEGORIES, CATEGORIES, defaultSettings, type ApartmentView } from '@/lib/domain/types';
import { monthTitle, monthsShort, shortDate } from '@/lib/ui/format';

const dictionaries: Record<Lang, Record<string, string>> = { en, sv, fi };
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the offered languages', () => {
  it('are English, Swedish and Finnish', () => {
    expect([...LANGS]).toEqual(['en', 'sv', 'fi']);
  });
});

describe.each(['sv', 'fi'] as const)('the %s translation', (lang) => {
  const dict = dictionaries[lang];

  it('has exactly the keys English has', () => {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
  });

  it('leaves no message empty', () => {
    expect(Object.entries(dict).filter(([, v]) => v.trim() === '')).toEqual([]);
  });

  it('uses the same {placeholders} as English in every message, or the value would never show', () => {
    const mismatched = Object.keys(en).filter(
      (k) => placeholders(dict[k]!).join() !== placeholders(en[k as keyof typeof en]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('describes every non-deductible cost category with a hint', () => {
    for (const c of COST_CATEGORIES.filter((k) => !CATEGORIES[k].deductible)) {
      expect(dict[`cat.${c}.hint`], c).toBeTruthy();
    }
  });
});

describe('pickLang', () => {
  it('prefers a stored choice over the browser language', () => {
    expect(pickLang('fi', ['sv-SE'])).toBe('fi');
  });

  it('follows the first browser language we have, matching on the base language', () => {
    expect(pickLang(null, ['de-DE', 'sv-FI', 'fi'])).toBe('sv');
    expect(pickLang(null, ['fi-FI'])).toBe('fi');
  });

  it('falls back to English for an unknown stored value or unsupported browser languages', () => {
    expect(pickLang('klingon', ['de', 'fr'])).toBe('en');
    expect(pickLang(undefined, [])).toBe('en');
  });
});

describe('translator', () => {
  it('fills {placeholders} and leaves unknown ones visible', () => {
    expect(translator('sv').t('home.allSet', { year: 2026 })).toBe('Redo för deklarationen 2026');
    expect(translator('en').t('home.allSet')).toBe('Ready for the {year} declaration');
  });

  it('picks the singular for exactly one and the plural otherwise', () => {
    const { tn } = translator('en');
    expect(tn('costs.entries', 1)).toBe('1 entry this year.');
    expect(tn('costs.entries', 0)).toBe('0 entries this year.');
    expect(tn('costs.entries', 2)).toBe('2 entries this year.');
    expect(translator('fi').tn('check.logged.todo', 1)).toBe('1 kuukausi ei ole vielä kirjattu');
    expect(translator('fi').tn('check.logged.todo', 4)).toBe('4 kuukautta ei ole vielä kirjattu');
  });
});

describe('dates in each language', () => {
  it('abbreviates months in twelve distinct words', () => {
    for (const lang of LANGS) expect(new Set(monthsShort(lang)).size).toBe(12);
  });

  it('writes short dates the local way', () => {
    expect(shortDate('2026-03-02')).toBe('2 Mar');
    expect(shortDate('2026-05-02', 'sv')).toBe('2 maj');
    expect(shortDate('2026-03-02', 'fi')).toBe('2. maalis');
    expect(shortDate('soon', 'fi')).toBe('');
  });

  it('spells out month titles', () => {
    expect(monthTitle('2026-03', 'sv')).toBe('mars 2026');
    expect(monthTitle('2026-12', 'fi')).toBe('joulukuu 2026');
    expect(monthTitle('nope', 'fi')).toBe('nope');
  });
});

describe('the checklist in another language', () => {
  const apt: ApartmentView = {
    id: 'a1',
    settings: { ...defaultSettings, name: 'Flat' },
    rents: [{ month: '2025-01', status: 'paid', amount: 700, receivedDate: '2025-01-03', note: '' }],
    costs: [],
    owners: [{ userId: 'u1', email: 'me@example.test', sharePct: 100 }],
    invites: [],
    mySharePct: 100,
  };

  it('is worded in the chosen language, with the same items', () => {
    const tax = computeTax(apt, 2025, new Date('2026-06-15T12:00:00Z'));
    const args = { apt, tax };
    const swedish = buildChecklist(args, translator('sv'));
    expect(swedish.map((i) => i.id)).toEqual(buildChecklist(args).map((i) => i.id));
    expect(swedish.find((i) => i.id === 'logged')!.text).toBe('11 månader är inte loggade ännu');
    expect(swedish.find((i) => i.id === 'price')!.text).toBe('Ange inköpspriset (för avskrivning och avkastning)');
  });
});
