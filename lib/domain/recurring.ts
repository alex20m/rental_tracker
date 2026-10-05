import type { CostCategory } from '@/lib/domain/types';
import { CATEGORIES, COST_CATEGORIES } from '@/lib/domain/types';

/**
 * What can be booked every month by itself: costs that are paid in full in the
 * year they fall. A basic improvement or dearer furniture is spread over years
 * and bought now and then, so repeating one is never what anybody means.
 */
export const RECURRING_CATEGORIES: readonly CostCategory[] = COST_CATEGORIES.filter(
  (c) => CATEGORIES[c].treatment !== 'improvement' && CATEGORIES[c].treatment !== 'furniture',
);

/** The month after `month`, both as YYYY-MM. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
