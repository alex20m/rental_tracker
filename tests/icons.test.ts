import { readFileSync } from 'node:fs';
import type { Icons } from 'next/dist/lib/metadata/types/metadata-types';
import { describe, expect, it, vi } from 'vitest';

// next/font only works inside the Next compiler; the layout's metadata is all this test needs.
const font = () => ({ variable: '' });
vi.mock('next/font/google', () => ({ Plus_Jakarta_Sans: font }));
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
  it('cuts the door cleanly through the bottom of the building, leaving no hairline under it', () => {
    // Two edges that meet exactly are each anti-aliased, which paints a faint line between them.
    const svg = readFileSync('public/icon.svg', 'utf8');
    const building = /<rect x="144" y="(\d+)" width="224" height="(\d+)"/.exec(svg);
    const door = /M232 (\d+)v/.exec(svg);
    expect(building && door, 'the building and its door are where the logo draws them').toBeTruthy();
    expect(Number(door![1]), 'the door runs past the building').toBeGreaterThan(Number(building![1]) + Number(building![2]));
    // In the app's own copy of the mark the door is part of the outline, not a hole meeting the edge.
    const ui = readFileSync('components/ui.tsx', 'utf8');
    expect(ui).not.toMatch(/M232 416v-60a24 24 0 0 1 48 0v60z/);
    expect(ui).toMatch(/H280v-60a24 24 0 0 0-48 0v60H164/);
  });
});
