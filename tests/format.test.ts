import { describe, expect, it } from 'vitest';
import { eur } from '@/lib/domain/tax';
import { eurWhole, moneyParts, monthTitle, shortDate } from '@/lib/ui/format';

const plain = (s: string) => s.replace(/\s/g, ' ');

describe('shortDate', () => {
  it('writes the day without a leading zero and the month in letters', () => {
    expect(shortDate('2026-03-02')).toBe('2 Mar');
    expect(shortDate('2026-12-31')).toBe('31 Dec');
  });

  it('is empty for an empty or malformed date', () => {
    expect(shortDate('')).toBe('');
    expect(shortDate('soon')).toBe('');
  });
});

describe('monthTitle', () => {
  it('spells out the month and keeps the year', () => {
    expect(monthTitle('2026-03')).toBe('March 2026');
    expect(monthTitle('2025-12')).toBe('December 2025');
  });

  it('falls back to the raw value when it is not a month', () => {
    expect(monthTitle('nope')).toBe('nope');
  });
});

describe('eurWhole', () => {
  it('rounds to whole euros with a thousands separator', () => {
    expect(plain(eurWhole(3312))).toBe('3 312 €');
    expect(plain(eurWhole(181.6))).toBe('182 €');
  });

  it('never shows a negative zero', () => {
    expect(plain(eurWhole(-0.4))).toBe('0 €');
  });

  it('keeps the sign of a real loss', () => {
    expect(eurWhole(-250)).toMatch(/^[-−]250/);
  });
});

describe('moneyParts', () => {
  it('splits the euros from the cents so the cents can be set small', () => {
    const p = moneyParts(1234.5);
    expect(plain(p.main)).toBe('1 234');
    expect(plain(p.rest)).toBe(',50 €');
  });

  it('never changes the text, only where it is split', () => {
    for (const v of [0, 7, 0.05, 181.2, 99999.99, -12.3]) expect(moneyParts(v).main + moneyParts(v).rest).toBe(eur(v));
  });

  it('keeps the minus sign with the euros', () => {
    expect(moneyParts(-12.3).main).toMatch(/^[-−]12$/);
  });
});
