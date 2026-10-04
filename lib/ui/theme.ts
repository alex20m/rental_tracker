export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'system';
export const THEME_KEY = 'rental-tracker:theme';

export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

/**
 * Runs in <head> before first paint, so a chosen theme never flashes the other
 * one. "System" sets no attribute and leaves the decision to the browser's
 * prefers-color-scheme media query in globals.css.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
