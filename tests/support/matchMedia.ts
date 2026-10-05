import { vi } from 'vitest';

/** jsdom has no `matchMedia`; the install offer asks it whether the app is running installed (it is not). */
export function stubMatchMedia(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}
