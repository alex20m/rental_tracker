import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const css = read('app/globals.css');
const manifest = JSON.parse(read('public/manifest.webmanifest')) as { background_color: string; theme_color: string };
const layout = read('app/layout.tsx');

/** The body of the CSS rule that starts with `selector {`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

/** The value of a design token in the light palette, or the dark one (what "Dark" forces). */
function token(name: string, scheme: 'light' | 'dark'): string {
  const block = rule(scheme === 'light' ? ':root' : ":root[data-theme='dark']");
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`--${name} is not defined for ${scheme}`);
  return (match[1] ?? '').trim();
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours: 1 (none) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('the Mono Ink theme', () => {
  it('draws the same dark palette when the device is dark as when Dark is chosen', () => {
    const tokens = (block: string) => block.match(/--[\w-]+:[^;]+;/g)?.map((t) => t.replace(/\s+/g, ' ')) ?? [];
    const forced = tokens(rule(":root[data-theme='dark']"));
    expect(forced.length).toBeGreaterThan(10);
    expect(tokens(rule(":root:not([data-theme='light'])"))).toEqual(forced);
  });

  it('has a light and a dark scheme that differ', () => {
    expect(token('bg', 'light')).not.toBe(token('bg', 'dark'));
    expect(luminance(token('bg', 'light'))).toBeGreaterThan(0.5);
    expect(luminance(token('bg', 'dark'))).toBeLessThan(0.05);
  });

  it('is Mono Ink: black and white, with colour kept for status', () => {
    expect(token('bg', 'light')).toBe('#ffffff');
    expect(token('brand', 'light')).toBe('#0a0a0a');
    expect(token('bg', 'dark')).toBe('#000000');
    expect(token('brand', 'dark')).toBe('#ffffff');
    // The accent is the text colour itself: nothing in the chrome is tinted.
    for (const scheme of ['light', 'dark'] as const) {
      for (const name of ['bg', 'card', 'text', 'text-2', 'muted', 'line', 'tint', 'brand', 'brand-soft']) {
        const hex = token(name, scheme);
        expect(hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7), `${name} ${scheme} is grey`).toBe(true);
      }
    }
  });

  it('gives rounded surfaces and one soft shadow for what floats', () => {
    expect(token('radius', 'light')).toBe('12px');
    expect(token('shadow', 'light')).not.toBe('none');
  });

  // WCAG AA: 4.5:1 for text. Every pairing the stylesheet actually draws text in.
  describe.each(['light', 'dark'] as const)('%s text contrast', (scheme) => {
    const pairs: [string, string][] = [
      ['text', 'bg'],
      ['text', 'card'],
      ['text-2', 'card'],
      ['muted', 'bg'],
      ['muted', 'card'],
      ['brand', 'card'],
      ['brand', 'brand-soft'],
      ['brand-ink', 'brand'],
      ['good', 'good-soft'],
      ['warn', 'warn-soft'],
      ['bad', 'bad-soft'],
    ];
    it.each(pairs)('%s on %s is at least 4.5:1', (fg, bg) => {
      expect(contrast(token(fg, scheme), token(bg, scheme))).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('gives the installed app the same colours as the page', () => {
    expect(manifest.background_color).toBe(token('bg', 'light'));
    expect(manifest.theme_color).toBe(token('brand', 'light'));
    expect(layout).toContain(`color: '${token('bg', 'light')}'`);
    expect(layout).toContain(`color: '${token('bg', 'dark')}'`);
  });

  it('draws the app icon in the brand colour', () => {
    expect(read('public/icon.svg')).toContain(`fill="${token('brand', 'light')}"`);
  });

  it('keeps a popover legible: its text is not smaller than the body’s small print', () => {
    const popover = /\.popover \{[^}]*font-size:\s*(\d+)px/.exec(css);
    expect(Number(popover?.[1])).toBeGreaterThanOrEqual(14);
  });

  it('keeps every button and field at least 48px tall', () => {
    for (const selector of ['.btn', 'input, select, textarea']) {
      const rule = new RegExp(`(?:^|\\n)${selector.replace(/[.,]/g, '\\$&')} \\{[^}]*min-height:\\s*(\\d+)px`).exec(css);
      expect(Number(rule?.[1]), selector).toBeGreaterThanOrEqual(48);
    }
  });
});
