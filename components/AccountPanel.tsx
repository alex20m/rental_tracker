'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { authClient } from '@/lib/client/authClient';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
import LanguagePicker from '@/components/LanguagePicker';
import { Avatar, ErrorNote, Icon, Info } from '@/components/ui';

/** Everything about you rather than about an apartment: who you are, language, signing out, leaving. */
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
    <div role="region" aria-label={t('settings.account')}>
      <div className="row" style={{ borderBottom: 0, paddingTop: 4 }}>
        <Avatar text={account.name} />
        <div className="main">
          <div className="t">{account.name}</div>
          <div className="s">{account.email}</div>
        </div>
      </div>

      <ErrorNote message={error} />

      <div style={{ marginTop: 14 }}>
        <LanguagePicker />
      </div>

      <button className="row-btn" style={{ borderBottom: 0, color: 'var(--bad)' }} onClick={signOut}>
        {Icon.signout}
        <div className="main">
          <div className="t">{t('menu.signOut')}</div>
        </div>
      </button>

      <button className="link danger" style={{ marginTop: 14 }} onClick={deleteAccount}>
        {t('menu.deleteAccount')}
      </button>
      <Info about={t('menu.deleteAccountAbout')}>{t('menu.deleteAccountInfo')}</Info>
    </div>
  );
}
