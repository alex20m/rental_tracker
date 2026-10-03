import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const css = read('app/globals.css');
const manifest = JSON.parse(read('public/manifest.webmanifest')) as { background_color: string; theme_color: string };
const layout = read('app/layout.tsx');

/** The value of a design token inside the first (light) or second (dark) :root block. */
function token(name: string, scheme: 'light' | 'dark'): string {
  const blocks = css.split(':root {').slice(1).map((b) => b.slice(0, b.indexOf('}')));
  const block = blocks[scheme === 'light' ? 0 : 1] ?? '';
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`--${name} is not defined for ${scheme}`);
  return (match[1] ?? '').trim();
}

describe('Mono Ink theme', () => {
  it('is black and white, with colour kept for status', () => {
    expect(token('bg', 'light')).toBe('#ffffff');
    expect(token('brand', 'light')).toBe('#0a0a0a');
    expect(token('bg', 'dark')).toBe('#000000');
    expect(token('brand', 'dark')).toBe('#ffffff');
  });

  it('has no shadows and small radii', () => {
    expect(token('shadow', 'light')).toBe('none');
    expect(token('radius', 'light')).toBe('8px');
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
});
