import { repeatDay } from './recurring';
import type { RentEntry } from './types';

/**
 * The day a rent being logged is suggested to have been received. Rent is taxed
 * in the year it is received, so the suggestion decides which year it lands in
 * unless it is changed: today for the month that is running, and for a month
 * already over a day in that month — the day of the month the rent came in the
 * last time before, else the first — never today, which would move last
 * December's rent into this year's income.
 */
export function suggestedReceivedDate(month: string, rents: RentEntry[], today: string): string {
  if (today.startsWith(month)) return today;
  const before = rents.filter((r) => r.status === 'paid' && r.month < month).sort((a, b) => a.month.localeCompare(b.month));
  const last = before[before.length - 1];
  return `${month}-${String(last ? repeatDay(last.receivedDate) : 1).padStart(2, '0')}`;
}
