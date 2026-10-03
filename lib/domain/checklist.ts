import type { TaxResult } from './tax';
import type { ApartmentView } from './types';

/** Where fixing a checklist item happens. */
export type FixTarget = 'rent' | 'costs' | 'settings' | 'account';

export interface ChecklistItem {
  id: 'name' | 'price' | 'logged' | 'unpaid' | 'receipts' | 'invites';
  ok: boolean;
  /** What is wrong, or — when `ok` — what is fine. */
  text: string;
  to: FixTarget;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Everything worth checking before the declaration is filed. One list feeds
 * both the Home to-do and the Tax page, so the two can never disagree.
 */
export function buildChecklist(args: { apt: ApartmentView; tax: TaxResult; taxpayerName: string }): ChecklistItem[] {
  const { apt, tax, taxpayerName } = args;
  const items: ChecklistItem[] = [
    {
      id: 'name',
      ok: !!taxpayerName,
      text: taxpayerName ? 'Name on the declaration' : 'Add your name for the declaration',
      to: 'account',
    },
    {
      id: 'price',
      ok: apt.settings.purchasePrice > 0,
      text:
        apt.settings.purchasePrice > 0 ? 'Purchase price set' : 'Add the purchase price (for depreciation and yield)',
      to: 'settings',
    },
    {
      id: 'logged',
      ok: tax.unloggedMonths === 0,
      text:
        tax.unloggedMonths === 0
          ? 'Every month logged'
          : `${plural(tax.unloggedMonths, 'month', 'months')} not logged yet`,
      to: 'rent',
    },
    {
      id: 'unpaid',
      ok: tax.unpaidMonths === 0,
      text:
        tax.unpaidMonths === 0
          ? 'No unpaid months'
          : `${plural(tax.unpaidMonths, 'month', 'months')} unpaid — not counted as income`,
      to: 'rent',
    },
    {
      id: 'receipts',
      ok: tax.costsWithoutReceipt === 0,
      text:
        tax.costsWithoutReceipt === 0
          ? 'Every cost has a receipt'
          : `${tax.costsWithoutReceipt} ${tax.costsWithoutReceipt === 1 ? 'cost has' : 'costs have'} no receipt photo`,
      to: 'costs',
    },
  ];
  if (apt.invites.length > 0) {
    items.push({
      id: 'invites',
      ok: false,
      text: `${plural(apt.invites.length, 'invited owner hasn’t', 'invited owners haven’t')} joined yet — check the shares are final`,
      to: 'settings',
    });
  }
  return items;
}
