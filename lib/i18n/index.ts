import { en, type MessageKey } from './en';
import { fi } from './fi';
import { sv } from './sv';

export type { MessageKey };

export const LANGS = ['en', 'sv', 'fi'] as const;
export type Lang = (typeof LANGS)[number];

/** Each language's own name, so a reader can find theirs whatever language the page is in. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', sv: 'Svenska', fi: 'Suomi' };

export const DEFAULT_LANG: Lang = 'en';
export const LANG_KEY = 'rental-tracker:language';

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, sv, fi };

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/**
 * The language to start in: the one the person chose, else the first of the
 * browser's preferred languages that we have, else English.
 */
export function pickLang(stored: string | null | undefined, preferred: readonly string[] = []): Lang {
  if (isLang(stored)) return stored;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return DEFAULT_LANG;
}

export type Params = Record<string, string | number>;

export type Translator = {
  lang: Lang;
  /** A message, with `{name}` placeholders filled from `params`. */
  t: (key: MessageKey, params?: Params) => string;
  /** The `.one` or `.other` form of a message, by `n` — which is also available to it as `{n}`. */
  tn: (key: PluralKey, n: number, params?: Params) => string;
};

type PluralKey = MessageKey extends infer K ? (K extends `${infer P}.one` ? P : never) : never;

function fill(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;
}

export function translator(lang: Lang): Translator {
  const messages = MESSAGES[lang];
  const plural = new Intl.PluralRules(lang);
  const t: Translator['t'] = (key, params) => fill(messages[key], params);
  const tn: Translator['tn'] = (key, n, params) => {
    const form = plural.select(n) === 'one' ? 'one' : 'other';
    return t(`${key}.${form}` as MessageKey, { n, ...params });
  };
  return { lang, t, tn };
}
