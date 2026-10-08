import { describe, expect, it } from 'vitest';
import { LATEST_RULES_YEAR, RULES, rulesFor } from '@/lib/domain/taxRules';

describe('the rules by tax year', () => {
  it('holds the figures vero.fi gives for 2025', () => {
    expect(rulesFor(2025)).toEqual({
      capitalIncome: { lowRate: 0.3, highRate: 0.34, limit: 30000 },
      deficitCredit: { rate: 0.3, max: 1400, childIncrease: 400, carryForwardYears: 10 },
      buildingRate: { residential: 4, commercial: 7 },
      movable: { atOnceLimit: 1200, rate: 0.25, minLifeYears: 3 },
      improvement: { minYears: 3, maxYears: 10 },
      furnishedFlatRate: { studio: 40, larger: 60 },
      mileagePerKm: 0.27,
      sourceTaxOnEarnedIncome: 0.35,
      sale: { assumedShort: 0.2, assumedLong: 0.4, assumedLongYears: 10, taxFreeYears: 2, lossCarryForwardYears: 5 },
      recordKeepingYears: 6,
    });
  });

  it('applies a rule set from its own year until a later one replaces it', () => {
    expect(RULES.map(([year]) => year)).toEqual([...new Set(RULES.map(([year]) => year))].sort());
    for (const [year, rules] of RULES) expect(rulesFor(year)).toBe(rules);
    const last = RULES[RULES.length - 1]!;
    expect(rulesFor(last[0] + 5)).toBe(last[1]);
    expect(LATEST_RULES_YEAR).toBe(last[0]);
  });

  it('uses the oldest set for a year before all of them', () => {
    expect(rulesFor(RULES[0]![0] - 10)).toBe(RULES[0]![1]);
  });

  it('keeps the 2026 kilometre rate at the 2025 figure, not the 0.55 an employer may pay tax-free', () => {
    expect(rulesFor(2026).mileagePerKm).toBe(0.27);
  });
});
