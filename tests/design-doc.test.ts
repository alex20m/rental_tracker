import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * DESIGN.md is the app's design system, and it only stays true if it moves with
 * the stylesheets. A token added to the CSS without a line in DESIGN.md, or a
 * line in DESIGN.md for a token that no longer exists, fails here, so a design
 * change cannot land without its documentation.
 */
const read = (path: string) => readFileSync(path, 'utf8');
const STYLESHEETS = ['app/tokens.css', 'app/globals.css', 'app/base.css'];

/** Custom properties a stylesheet declares (`--name:`), not those it only reads. */
const declared = (css: string) => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));

/** Set by next/font in app/layout.tsx rather than declared in CSS. */
const FROM_LAYOUT = new Set(['--font-jakarta']);

describe('DESIGN.md, the design system', () => {
  const doc = existsSync('DESIGN.md') ? read('DESIGN.md') : '';
  const tokens = new Set(STYLESHEETS.flatMap((file) => [...declared(read(file))]));

  it('exists at the root, where people and design tools look for it', () => {
    expect(doc.length, 'DESIGN.md is missing or empty').toBeGreaterThan(0);
  });

  it('describes every token the stylesheets declare', () => {
    const missing = [...tokens].filter((t) => !new RegExp(`${t}(?![\\w-])`).test(doc));
    expect(missing, 'tokens with no line in DESIGN.md').toEqual([]);
  });

  it('names no token that the stylesheets no longer declare', () => {
    // A token is written on its own in backticks (`--name`); command-line flags and `--color-*` wildcards are not tokens.
    const named = new Set([...doc.matchAll(/`(--[a-z][\w-]*[a-z0-9])`/g)].map((m) => m[1]!));
    const stale = [...named].filter((t) => !tokens.has(t) && !FROM_LAYOUT.has(t));
    expect(stale, 'tokens DESIGN.md describes that do not exist').toEqual([]);
  });
});
