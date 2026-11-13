import { describe, expect, it } from 'vitest';
import { suggestedReceivedDate } from '@/lib/domain/rentDate';
import type { RentEntry } from '@/lib/domain/types';

const paid = (month: string, receivedDate: string): RentEntry => ({ month, status: 'paid', amount: 800, receivedDate, note: '' });
const vacant = (month: string): RentEntry => ({ month, status: 'vacant', amount: 0, receivedDate: '', note: '' });

describe('the day a rent is suggested to have been received', () => {
  it('is today for the month that is running', () => {
    expect(suggestedReceivedDate('2026-11', [paid('2026-10', '2026-10-03')], '2026-11-13')).toBe('2026-11-13');
  });

  it('is in the month the rent is for when that month is over, so last December’s rent is not counted as this year’s income', () => {
    expect(suggestedReceivedDate('2025-12', [], '2026-01-10')).toBe('2025-12-01');
  });

  it('is the day of the month the rent came in the last time before', () => {
    const rents = [paid('2026-01', '2026-01-05'), vacant('2026-02'), paid('2026-04', '2026-04-09')];
    expect(suggestedReceivedDate('2026-03', rents, '2026-11-13')).toBe('2026-03-05');
  });

  it('never suggests a day the month does not have', () => {
    expect(suggestedReceivedDate('2026-02', [paid('2026-01', '2026-01-31')], '2026-11-13')).toBe('2026-02-28');
  });
});
