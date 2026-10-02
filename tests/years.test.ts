import { describe, expect, it } from 'vitest';
import { stepYear } from '@/lib/ui/years';

describe('stepping the tax year', () => {
  const years = [2026, 2025, 2023]; // newest first, as the app builds the list

  it('goes back to the next older year with data', () => {
    expect(stepYear(years, 2026, -1)).toBe(2025);
  });

  it('goes forward to the next newer year', () => {
    expect(stepYear(years, 2023, 1)).toBe(2025);
  });

  it('stays on the oldest year when going back from it', () => {
    expect(stepYear(years, 2023, -1)).toBe(2023);
  });

  it('stays on the newest year when going forward from it', () => {
    expect(stepYear(years, 2026, 1)).toBe(2026);
  });

  it('snaps to the nearest known year when the current one is not in the list', () => {
    expect(stepYear(years, 2024, -1)).toBe(2023);
    expect(stepYear(years, 2024, 1)).toBe(2025);
  });

  it('returns the year unchanged for an empty list', () => {
    expect(stepYear([], 2026, -1)).toBe(2026);
  });
});
