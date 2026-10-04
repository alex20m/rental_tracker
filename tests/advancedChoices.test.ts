import { describe, expect, it } from 'vitest';
import { advancedChoices } from '@/lib/ui/advancedChoices';
import { defaultSettings } from '@/lib/domain/types';

/**
 * The settings most landlords never touch live under "Advanced". This is what
 * the list of settings says about them: nothing for the standard case — one
 * person letting a whole flat in a housing company — and one phrase for each
 * choice that departs from it, so a changed setting never hides.
 */
describe('the advanced choices in use', () => {
  it('has none for the standard case', () => {
    expect(advancedChoices(defaultSettings)).toEqual([]);
  });

  it('names a property of one’s own, with its building depreciation when that is on', () => {
    expect(advancedChoices({ ...defaultSettings, propertyType: 'property' })).toEqual([['settings.type.property']]);
    expect(advancedChoices({ ...defaultSettings, propertyType: 'property', useDepreciation: true, depreciationRate: 7 })).toEqual([
      ['settings.type.property'],
      ['settings.advancedDepreciation', { rate: 7 }],
    ]);
  });

  it('ignores depreciation left switched on for a flat, which is never depreciated', () => {
    expect(advancedChoices({ ...defaultSettings, propertyType: 'share', useDepreciation: true })).toEqual([]);
  });

  it('names a part of the home let, a rent below the usual, and the flat-rate furniture deduction', () => {
    expect(advancedChoices({ ...defaultSettings, letSharePct: 60, belowMarketRent: true, furnishing: 'flat' })).toEqual([
      ['settings.advancedLetShare', { pct: 60 }],
      ['settings.advancedBelowMarket'],
      ['settings.advancedFlatRate'],
    ]);
  });
});
