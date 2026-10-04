import type { ApartmentSettings } from '@/lib/domain/types';
import type { MessageKey, Params } from '@/lib/i18n';

/**
 * What an apartment's advanced settings say, as message keys to show in the
 * list of settings: empty for the standard case (one person letting a whole flat
 * in a housing company), else one phrase for each choice that departs from it —
 * so a setting kept out of the way by "Advanced" is never one that is secretly on.
 */
export function advancedChoices(s: ApartmentSettings): Array<readonly [MessageKey, Params?]> {
  const out: Array<readonly [MessageKey, Params?]> = [];
  if (s.propertyType === 'property') {
    out.push(['settings.type.property']);
    // Only a property's building is depreciated; the switch is ignored for a flat.
    if (s.useDepreciation) out.push(['settings.advancedDepreciation', { rate: s.depreciationRate }]);
  }
  if (s.letSharePct !== 100) out.push(['settings.advancedLetShare', { pct: s.letSharePct }]);
  if (s.belowMarketRent) out.push(['settings.advancedBelowMarket']);
  if (s.furnishing === 'flat') out.push(['settings.advancedFlatRate']);
  return out;
}
