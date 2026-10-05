---
name: money-arithmetic
description: >-
  Do arithmetic on money in JavaScript/TypeScript so the cent is right. Use when
  writing or reviewing any code that rounds an amount, takes a percentage or
  share of one, sums amounts, or shows a total — and when someone says a figure
  is "off by a cent". Covers why Math.round(x * 100) / 100 (with or without
  Number.EPSILON) goes the wrong way on exact half cents, the one rounding
  helper to use, how to test it against exact integer arithmetic, and why a sum
  of floats can display as a loss of "−0,00".
---

# Money arithmetic

Amounts here are two-decimal numbers in doubles. Adding and subtracting them is
safe *once the result is rounded*; multiplying them by a rate or a share is where
it goes wrong.

## The trap: exact half cents

25 % of 1 200,10 is 300,025. A share of a two-decimal amount lands on an exact
half cent about one time in eight, and a double stores that value a hair below
or above the half. `Math.round(x * 100) / 100` then rounds the wrong way for
roughly half of those, so the answer is a cent short. Adding `Number.EPSILON`
does not cure it: it is smaller than the spacing of doubles above 2, so it
changes nothing for most amounts. The symptom is a total that is one cent away
from what a calculator gives, only for some amounts — which is why a handful of
hand-picked test values never shows it.

## The rule

One helper, used everywhere an amount is rounded; no inline `Math.round(n * 100) / 100`:

```ts
export const round2 = (n: number) => {
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  return cents === 0 ? 0 : (Math.sign(n) * cents) / 100;
};
```

`toPrecision(15)` drops the binary noise (a double holds 15–16 significant
digits exactly) before the rounding decides; the half goes away from zero for
both signs; `0` never comes back as `-0`.

Round **once, at the end of the product** — `round2((n * pct) / 100)`, not
`round2(n * pct) / 100` — and round every intermediate that is shown or summed,
so the figures on a page add up line by line.

## Sums

Sum, then `round2` the sum, before comparing it with zero or choosing a sign or
colour from it. `0.3 + -0.2 + -0.1` is `-2.8e-17`, which is "negative", and the
formatter prints `−0,00 €` in the loss colour.

## Prove it against exact arithmetic, not against the same float maths

Test the helper and the first caller of each rate with literal half-cent cases
(`2.135 → 2.14`, `300.025 → 300.03`, `-2.135 → -2.14`), and once, in a scratch
script, brute-force every cent in a range against BigInt integer arithmetic
(`(2·cents·num + den) / (2·den)` is round-half-up). An expectation written as
`Math.round(x * 100) / 100` in the test repeats the bug and passes.

## What is not covered

Rounding mode is a rule of the domain: the Finnish tax forms here take cents and
nothing says which way a half goes, so half-up (away from zero) is a choice. If a
law or a bank states another mode, change the helper and say so. Amounts above
about 10⁸ € are outside what the 15-digit trick and a `numeric(12,2)` check
were verified for.
