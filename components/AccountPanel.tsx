'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { authClient } from '@/lib/client/authClient';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
import LanguagePicker from '@/components/LanguagePicker';
import ThemePicker from '@/components/ThemePicker';
import { Avatar, ErrorNote, Heading, Icon, Info } from '@/components/ui';

/** Who you are, language, signing out, leaving. */
export default function AccountPanel({ account }: { account: Account }) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState('');

  const signOut = async () => {
    await authClient()
      .signOut()
      .catch(() => {});
    router.replace('/sign-in');
  };

  const deleteAccount = async () => {
    if (!confirm(t('menu.deleteAccountConfirm'))) return;
    setError('');
    try {
      await api.deleteAccount();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    await signOut();
  };

  return (
    <div className="stack" role="region" aria-label={t('settings.account')}>
      <div className="card pad">
        <div className="row" style={{ borderBottom: 0 }}>
          <Avatar text={account.name} />
          <div className="main">
            <div className="t">{account.name}</div>
            <div className="s">{account.email}</div>
          </div>
        </div>
      </div>

      <ErrorNote message={error} />

      <section>
        <Heading>{t('language.label')}</Heading>
        <LanguagePicker />
      </section>

      <section>
        <Heading>{t('theme.label')}</Heading>
        <ThemePicker />
      </section>

      <button className="btn block" onClick={signOut}>
        {Icon.signout}
        {t('menu.signOut')}
      </button>

      <div>
        <button className="link danger" onClick={deleteAccount}>
          {t('menu.deleteAccount')}
        </button>
        <Info about={t('menu.deleteAccountAbout')}>{t('menu.deleteAccountInfo')}</Info>
      </div>
    </div>
  );
}
