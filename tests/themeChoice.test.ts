import { describe, expect, it } from 'vitest';
import { THEME_INIT_SCRIPT, THEME_KEY, isTheme } from '@/lib/ui/theme';

describe('theme choice', () => {
  it('accepts exactly system, light and dark', () => {
    expect(['system', 'light', 'dark', 'sepia', '', null].map(isTheme)).toEqual([true, true, true, false, false, false]);
  });

  it('applies a stored dark or light theme before paint, and ignores "system" and junk', () => {
    const run = (stored: string | null) => {
      const root = { dataset: {} as Record<string, string> };
      new Function('localStorage', 'document', THEME_INIT_SCRIPT)(
        { getItem: (k: string) => (k === THEME_KEY ? stored : null) },
        { documentElement: root },
      );
      return root.dataset.theme;
    };
    expect(run('dark')).toBe('dark');
    expect(run('light')).toBe('light');
    expect(run('system')).toBeUndefined();
    expect(run('neon')).toBeUndefined();
    expect(run(null)).toBeUndefined();
  });

  it('does not throw when storage is unavailable', () => {
    const boom = () => {
      throw new Error('denied');
    };
    expect(() => new Function('localStorage', 'document', THEME_INIT_SCRIPT)({ getItem: boom }, { documentElement: { dataset: {} } })).not.toThrow();
  });
});
