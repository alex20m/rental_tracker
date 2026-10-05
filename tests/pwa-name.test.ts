import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const layout = readFileSync('app/layout.tsx', 'utf8');

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { name: string; short_name: string };

describe('installed PWA name', () => {
  it('shows "Rental Tracker" under the Android home-screen icon', () => {
    expect(manifest.name).toBe('Rental Tracker');
    expect(manifest.short_name).toBe('Rental Tracker');
  });

  it('shows "Rental Tracker" under the iOS home-screen icon', () => {
    expect(layout).toMatch(/appleWebApp:\s*\{[^}]*title: 'Rental Tracker'/);
  });
});
