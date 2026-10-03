import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '@/components/I18nProvider';

/** Testing Library's render, inside the same provider the app's layout puts around every screen. */
export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: I18nProvider, ...options });
}
