'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LANG, LANG_KEY, pickLang, translator, type Lang, type Translator } from '@/lib/i18n';

type I18n = Translator & { setLang: (lang: Lang) => void };

// No default: every screen sits under <I18nProvider> (app/layout.tsx), and a
// component rendered on its own — in a unit test — is wrapped in it too
// (tests/support/render.tsx). A silent English fallback with a do-nothing
// setLang would only hide a missing provider.
const Context = createContext<I18n | null>(null);

export function useI18n(): I18n {
  return useContext(Context)!;
}

function remember(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable — the choice just lasts until the page is closed */
  }
}

/**
 * Holds the chosen language. The server and the first client render are always
 * English so they agree; the stored or browser language is applied right after.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANG_KEY);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state, unknowable during the server render
    setLangState(pickLang(stored, navigator.languages?.length ? navigator.languages : [navigator.language]));
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    remember(next);
  }, []);

  const value = useMemo<I18n>(() => ({ ...translator(lang), setLang }), [lang, setLang]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
