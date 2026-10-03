import type { TaxResult } from './tax';
import type { ApartmentView } from './types';
import { translator, type Translator } from '@/lib/i18n';

/** Where fixing a checklist item happens. */
export type FixTarget = 'rent' | 'costs' | 'settings' | 'account';

export interface ChecklistItem {
  id: 'name' | 'price' | 'logged' | 'unpaid' | 'receipts' | 'invites';
  ok: boolean;
  /** What is wrong, or — when `ok` — what is fine. */
  text: string;
  to: FixTarget;
}

/**
 * Everything worth checking before the declaration is filed. One list feeds
 * both the Home to-do and the Tax page, so the two can never disagree.
 */
export function buildChecklist(
  args: { apt: ApartmentView; tax: TaxResult; taxpayerName: string },
  { t, tn }: Translator = translator('en'),
): ChecklistItem[] {
  const { apt, tax, taxpayerName } = args;
  const items: ChecklistItem[] = [
    {
      id: 'name',
      ok: !!taxpayerName,
      text: t(taxpayerName ? 'check.name.ok' : 'check.name.todo'),
      to: 'account',
    },
    {
      id: 'price',
      ok: apt.settings.purchasePrice > 0,
      text: t(apt.settings.purchasePrice > 0 ? 'check.price.ok' : 'check.price.todo'),
      to: 'settings',
    },
    {
      id: 'logged',
      ok: tax.unloggedMonths === 0,
      text: tax.unloggedMonths === 0 ? t('check.logged.ok') : tn('check.logged.todo', tax.unloggedMonths),
      to: 'rent',
    },
    {
      id: 'unpaid',
      ok: tax.unpaidMonths === 0,
      text: tax.unpaidMonths === 0 ? t('check.unpaid.ok') : tn('check.unpaid.todo', tax.unpaidMonths),
      to: 'rent',
    },
    {
      id: 'receipts',
      ok: tax.costsWithoutReceipt === 0,
      text:
        tax.costsWithoutReceipt === 0 ? t('check.receipts.ok') : tn('check.receipts.todo', tax.costsWithoutReceipt),
      to: 'costs',
    },
  ];
  if (apt.invites.length > 0) {
    items.push({
      id: 'invites',
      ok: false,
      text: tn('check.invites.todo', apt.invites.length),
      to: 'settings',
    });
  }
  return items;
}
