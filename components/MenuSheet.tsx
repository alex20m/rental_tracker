'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { authClient } from '@/lib/client/authClient';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
import LanguagePicker from '@/components/LanguagePicker';
import { Avatar, ErrorNote, Icon, Info, Sheet } from '@/components/ui';

type Props = {
  account: Account;
  /** The apartment being looked at, if any — its settings are one tap away. */
  apartmentName?: string;
  onSettings: () => void;
  onClose: () => void;
};

/** Everything about you rather than about an apartment. */
export default function MenuSheet({
  account,
  apartmentName,
  onSettings,
  onClose,
}: Props) {
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
    <Sheet title={t('menu.title')} onClose={onClose}>
      <div className="row" style={{ borderBottom: 0, paddingTop: 4 }}>
        <Avatar text={account.name} />
        <div className="main">
          <div className="t">{account.name}</div>
          <div className="s">{account.email}</div>
        </div>
      </div>

      {apartmentName && (
        <button className="row-btn" onClick={onSettings}>
          {Icon.gear}
          <div className="main">
            <div className="t">{t('menu.apartmentSettings')}</div>
            <div className="s">{apartmentName}</div>
          </div>
          {Icon.right}
        </button>
      )}

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
    </Sheet>
  );
}
