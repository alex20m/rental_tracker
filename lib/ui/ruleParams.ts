import { rulesFor } from '@/lib/domain/taxRules';
import type { Lang, Params } from '@/lib/i18n';

/** 1200 → "1 200", 0.27 → "0.27" (English) or "0,27" (Swedish, Finnish). */
function num(n: number, lang: Lang): string {
  const [whole, fraction] = String(Math.round(n * 100) / 100).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction ? grouped + (lang === 'en' ? '.' : ',') + fraction : grouped;
}

/**
 * The numbers the law sets, in the form a message wants them: write
 * `{limit}` in a message and pass these as its params. Messages never spell a
 * rate or an amount out, so a new year's rules reach every text at once.
 */
export function ruleParams(year: number, lang: Lang): Params {
  const r = rulesFor(year);
  const n = (v: number) => num(v, lang);
  const { max, childIncrease } = r.deficitCredit;
  return {
    capLow: n(r.capitalIncome.lowRate * 100),
    capHigh: n(r.capitalIncome.highRate * 100),
    capLimit: n(r.capitalIncome.limit),
    limit: n(r.movable.atOnceLimit),
    movableRate: n(r.movable.rate * 100),
    minLife: n(r.movable.minLifeYears),
    improvementMin: n(r.improvement.minYears),
    improvementMax: n(r.improvement.maxYears),
    buildingResidential: n(r.buildingRate.residential),
    buildingCommercial: n(r.buildingRate.commercial),
    flatStudio: n(r.furnishedFlatRate.studio),
    flatLarger: n(r.furnishedFlatRate.larger),
    mileage: n(r.mileagePerKm),
    creditRate: n(r.deficitCredit.rate * 100),
    creditMax: n(max),
    creditMaxOneChild: n(max + childIncrease),
    creditMaxChildren: n(max + 2 * childIncrease),
    carryYears: n(r.deficitCredit.carryForwardYears),
    sourceTax: n(r.sourceTaxOnEarnedIncome * 100),
  };
}
