import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const css = read('app/globals.css');
const tokensCss = read('app/tokens.css');
const manifest = JSON.parse(read('public/manifest.webmanifest')) as { background_color: string; theme_color: string };
const layout = read('app/layout.tsx');

/** The body of the CSS rule that starts with `selector {`, in `source`. */
function rule(selector: string, source = css): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unclosed rule for ${selector}`);
}

/** Every custom property a block declares, by name. */
function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/**
 * The tokens in force for a scheme: the theme's own (tokens.css), then the app's
 * mapping (globals.css), then what "Dark" forces on top.
 */
function palette(scheme: 'light' | 'dark'): Record<string, string> {
  const light = { ...declarations(rule(':root', tokensCss)), ...declarations(rule(':root')) };
  return scheme === 'light' ? light : { ...light, ...declarations(rule(":root[data-theme='dark']")) };
}

/** A token's value with every `var(--x)` it leans on resolved. */
function token(name: string, scheme: 'light' | 'dark'): string {
  const all = palette(scheme);
  let value = all[name];
  if (value === undefined) throw new Error(`--${name} is not defined for ${scheme}`);
  for (let hops = 0; /var\(--([\w-]+)\)/.test(value); hops++) {
    if (hops > 10) throw new Error(`--${name} does not resolve`);
    value = value.replace(/var\(--([\w-]+)\)/g, (_, n: string) => {
      const v = all[n];
      if (v === undefined) throw new Error(`--${n} (used by --${name}) is not defined for ${scheme}`);
      return v;
    });
  }
  return value;
}

/** sRGB channels (0–255) of a #rrggbb or oklch() colour, the way a browser draws it. */
function rgb(colour: string): [number, number, number] {
  if (colour.startsWith('#')) return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)) as [number, number, number];
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/.exec(colour);
  if (!m) throw new Error(`not a colour: ${colour}`);
  const [L, C, h] = [Number(m[1]) / 100, Number(m[2]), (Number(m[3]) * Math.PI) / 180];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return linear.map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  }) as [number, number, number];
}

const hex = (colour: string) => '#' + rgb(colour).map((c) => c.toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance. */
function luminance(colour: string): number {
  const [r, g, b] = rgb(colour).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio: 1 (none) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A length in px, from px or from rem at the default 16px. */
function px(value: string): number {
  const m = /^([\d.]+)(px|rem)$/.exec(value);
  if (!m) throw new Error(`not a length: ${value}`);
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
}

describe('the Mono theme', () => {
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

  it('is Mono: black and white like the logo, with colour kept for status', () => {
    // Every surface, text and control colour is a pure grey: equal red, green and blue.
    for (const scheme of ['light', 'dark'] as const) {
      for (const name of ['bg', 'card', 'text', 'text-2', 'muted', 'line', 'tint', 'tray', 'brand', 'brand-soft']) {
        const [r, g, b] = rgb(token(name, scheme));
        expect(r === g && g === b, `${name} ${scheme} is grey`).toBe(true);
      }
    }
    // The primary colour is the logo's own black by day and its inverse at night.
    expect(hex(token('brand', 'light'))).toBe(manifest.theme_color);
    expect(luminance(token('brand', 'dark'))).toBeGreaterThan(0.8);
  });

  it('marks status in colour: rent that is in green, what needs a look amber, cost bars yellow', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const name of ['good', 'good-soft']) {
        const [r, g, b] = rgb(token(name, scheme));
        expect(g > r && g > b, `${name} ${scheme} is green`).toBe(true);
      }
      for (const name of ['warn', 'warn-soft', 'bar-cost']) {
        // Amber and yellow: red leads, then green, with blue far behind.
        const [r, g, b] = rgb(token(name, scheme));
        expect(r >= g && g > b + 20, `${name} ${scheme} is amber or yellow`).toBe(true);
      }
    }
  });

  it('draws rent green and costs yellow, far enough apart in lightness to tell without colour', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const [r, g, b] = rgb(token('bar-rent', scheme));
      expect(g > r && g > b, `rent bars ${scheme} are green`).toBe(true);
      // Red-green colour blindness sees hue poorly but lightness well: bars of equal lightness would merge.
      expect(contrast(token('bar-rent', scheme), token('bar-cost', scheme)), `rent and cost bars ${scheme}`).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('gives rounded surfaces and one soft shadow for what floats', () => {
    expect(token('radius', 'light')).toBe('20px');
    expect(token('shadow', 'light')).not.toBe('none');
  });

  // WCAG AA: 4.5:1 for text. Every pairing the stylesheet actually draws text in.
  describe.each(['light', 'dark'] as const)('%s text contrast', (scheme) => {
    const pairs: [string, string][] = [
      ['text', 'bg'],
      ['text', 'card'],
      ['text', 'tray'],
      ['text', 'brand-soft'],
      ['text', 'raised'],
      ['text-2', 'card'],
      ['text-2', 'tray'],
      ['muted', 'bg'],
      ['muted', 'card'],
      ['muted', 'tray'],
      ['good', 'card'],
      ['good', 'good-soft'],
      ['brand-ink', 'brand'],
      ['brand-ink', 'brand-deep'], // a primary button under the pointer
      ['warn', 'warn-soft'],
      ['bad', 'bad-soft'],
      ['bad', 'card'],
    ];
    it.each(pairs)('%s on %s is at least 4.5:1', (fg, bg) => {
      expect(contrast(token(fg, scheme), token(bg, scheme))).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('gives the installed app the same paper as the page', () => {
    expect(manifest.background_color).toBe(hex(token('bg', 'light')));
    expect(layout).toContain(`color: '${hex(token('bg', 'light'))}'`);
    expect(layout).toContain(`color: '${hex(token('bg', 'dark'))}'`);
  });

  it('gives the installed app the colour of its icon', () => {
    expect(read('public/icon.svg')).toContain(`fill="${manifest.theme_color}"`);
  });

  it('keeps a popover legible: its text is not smaller than the body’s small print', () => {
    const size = /font-size:\s*([^;]+);/.exec(rule('.popover'))?.[1] ?? '';
    const value = size.startsWith('var(') ? token(size.slice(6, -1), 'light') : size;
    expect(px(value)).toBeGreaterThanOrEqual(14);
  });

  it('keeps every button and field at least 48px tall', () => {
    for (const selector of ['.btn', 'input, select, textarea']) {
      const rule = new RegExp(`(?:^|\\n)${selector.replace(/[.,]/g, '\\$&')} \\{[^}]*min-height:\\s*([^;]+);`).exec(css);
      const value = (rule?.[1] ?? '').trim();
      expect(px(value.startsWith('var(') ? token(value.slice(6, -1), 'light') : value), selector).toBeGreaterThanOrEqual(48);
    }
  });

  it('keeps date and month fields inside their column: iOS gives both an intrinsic width', () => {
    for (const type of ['date', 'month']) {
      const match = new RegExp(`input\\[type="${type}"\\][^{]*\\{([^}]*)\\}`).exec(css);
      expect(match, `no rule for ${type} inputs`).not.toBeNull();
      expect(match?.[1], type).toMatch(/appearance:\s*none/);
      expect(match?.[1], type).toMatch(/max-width:\s*100%/);
    }
  });

  it('starts a date or month value on the left and centres it vertically, like every other field', () => {
    // iOS centres the value horizontally, and centres it vertically only through its own
    // inline-flex; replacing that with display: block left "15 okt. 2026" stuck to the top.
    for (const type of ['date', 'month']) {
      const field = new RegExp(`input\\[type="${type}"\\][^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      expect(field, type).toMatch(/display:\s*flex/);
      expect(field, type).toMatch(/align-items:\s*center/);
    }
    const value = /::-webkit-date-and-time-value[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(value).toMatch(/text-align:\s*left/);
  });
});
