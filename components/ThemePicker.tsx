'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Segmented } from '@/components/ui';
import { DEFAULT_THEME, THEMES, THEME_KEY, isTheme, type Theme } from '@/lib/ui/theme';

/** Follow the device, or force light or dark. The choice is kept in this browser. */
export default function ThemePicker() {
  const { t } = useI18n();
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state, unknowable during the server render
    if (isTheme(stored)) setThemeState(stored);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable — the choice just lasts until the page is closed */
    }
  };

  return (
    <Segmented<Theme>
      label={t('theme.label')}
      value={theme}
      onChange={setTheme}
      options={THEMES.map((v) => ({ value: v, label: t(`theme.${v}`) }))}
    />
  );
}
