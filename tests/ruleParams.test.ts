import { describe, expect, it } from 'vitest';
import { ruleParams } from '@/lib/ui/ruleParams';

describe('the numbers the law sets, as the messages need them', () => {
  it('writes them for the language: a dot for English, a comma for Swedish and Finnish', () => {
    expect(ruleParams(2025, 'en')).toEqual({
      capLow: '30',
      capHigh: '34',
      capLimit: '30 000',
      limit: '1 200',
      movableRate: '25',
      minLife: '3',
      improvementMin: '3',
      improvementMax: '10',
      buildingResidential: '4',
      buildingCommercial: '7',
      flatStudio: '40',
      flatLarger: '60',
      mileage: '0.27',
      creditRate: '30',
      creditMax: '1 400',
      creditMaxOneChild: '1 800',
      creditMaxChildren: '2 200',
      carryYears: '10',
      sourceTax: '35',
      assumedShort: '20',
      assumedLong: '40',
      assumedLongYears: '10',
      freeYears: '2',
      lossYears: '5',
    });
    expect(ruleParams(2025, 'fi').mileage).toBe('0,27');
    expect(ruleParams(2025, 'sv').mileage).toBe('0,27');
  });

  it('follows the rules of the year it is asked for', () => {
    expect(ruleParams(2026, 'en').limit).toBe('1 200');
  });
});
