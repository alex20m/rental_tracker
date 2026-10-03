'use client';

import { LANGS, LANG_NAMES, type Lang } from '@/lib/i18n';
import { useI18n } from '@/components/I18nProvider';
import { Segmented } from '@/components/ui';

/** English, Swedish or Finnish — each named in its own language. */
export default function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  return (
    <Segmented<Lang>
      label={t('language.label')}
      value={lang}
      onChange={setLang}
      options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
    />
  );
}
