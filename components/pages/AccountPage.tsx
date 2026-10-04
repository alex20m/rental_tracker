'use client';

import type { Account } from '@/components/RentalApp';
import AccountPanel from '@/components/AccountPanel';
import { useI18n } from '@/components/I18nProvider';

/** Settings about you — name, language, signing out, leaving — kept apart from an apartment's settings. */
export default function AccountPage({ account }: { account: Account }) {
  const { t } = useI18n();
  return (
    <>
      <div className="pagehead">
        <h1>{t('nav.account')}</h1>
      </div>
      <AccountPanel account={account} />
    </>
  );
}
