/**
 * One step through the tax years. `years` is the list the app offers (any
 * order); the result is always one of them, so stepping past either end stays
 * put rather than inventing a year with no data.
 */
export function stepYear(years: number[], year: number, direction: 1 | -1): number {
  if (years.length === 0) return year;
  const sorted = [...years].sort((a, b) => a - b);
  const next = direction === 1 ? sorted.find((y) => y > year) : [...sorted].reverse().find((y) => y < year);
  return next ?? (sorted.includes(year) ? year : direction === 1 ? sorted[sorted.length - 1]! : sorted[0]!);
}
