/** Ownership shares are added in hundredths of a percent, never as floats. */
export function shareTotal(shares: number[]): number {
  const cents = shares.reduce((a, s) => a + (Number.isFinite(s) ? Math.round(s * 100) : 0), 0);
  return cents / 100;
}

/** Whether these shares account for the whole apartment — exactly 100 %. */
export function isWholeApartment(shares: number[]): boolean {
  return Math.round(shareTotal(shares) * 100) === 10000;
}
