import { describe, expect, it } from 'vitest';
import { shareTotal, isWholeApartment } from '@/lib/domain/shares';

describe('adding up ownership shares', () => {
  it('adds in hundredths, so shares that make 100 % read as exactly 100 %', () => {
    // As floats, 0.01 + 73.37 + 26.62 is 100.00000000000001.
    expect(shareTotal([0.01, 73.37, 26.62])).toBe(100);
    expect(isWholeApartment([0.01, 73.37, 26.62])).toBe(true);
  });

  it('is not the whole apartment a hundredth short or over', () => {
    expect(isWholeApartment([50, 49.99])).toBe(false);
    expect(isWholeApartment([50, 50.01])).toBe(false);
  });

  it('treats a blank or unreadable entry as nothing, not as the whole', () => {
    expect(shareTotal([100, Number.NaN])).toBe(100);
    expect(isWholeApartment([Number.NaN])).toBe(false);
  });

  it('is nothing for no owners', () => {
    expect(shareTotal([])).toBe(0);
    expect(isWholeApartment([])).toBe(false);
  });
});
