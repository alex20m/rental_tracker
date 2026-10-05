import { readFileSync } from 'node:fs';
import type { Icons } from 'next/dist/lib/metadata/types/metadata-types';
import { describe, expect, it, vi } from 'vitest';

// next/font only works inside the Next compiler; the layout's metadata is all this test needs.
vi.mock('next/font/google', () => ({ Geist: () => ({ variable: '' }) }));
const { metadata } = await import('@/app/layout');
const icons = metadata.icons as Icons;

const png = (path: string) => readFileSync(`public/${path}`);

describe('app icons', () => {
  it('points iOS at a 180x180 PNG with no transparency, which iOS would paint black', () => {
    expect(icons.apple).toEqual({ url: '/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' });
    const file = png('apple-touch-icon-180.png');
    expect(file.readUInt32BE(16)).toBe(180);
    expect(file.readUInt32BE(20)).toBe(180);
    expect(file[25]).toBe(2); // PNG colour type 2 = RGB, no alpha channel
  });

  it('gives Safari tabs a PNG favicon, since iOS does not draw SVG ones', () => {
    expect(icons.icon).toContainEqual({ url: '/favicon-48.png', sizes: '48x48', type: 'image/png' });
    expect(png('favicon-48.png').readUInt32BE(16)).toBe(48);
  });
});
