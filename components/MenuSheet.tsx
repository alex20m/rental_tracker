'use client';

import AccountPanel from '@/components/AccountPanel';
import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
import { Sheet } from '@/components/ui';

/** The account, before there is an apartment (and so a Settings tab) to hold it. */
export default function MenuSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet title={t('menu.title')} onClose={onClose}>
      <AccountPanel account={account} />
    </Sheet>
  );
}
