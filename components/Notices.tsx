'use client';

import type { Account } from '@/components/RentalApp';
import { useI18n } from '@/components/I18nProvider';
import { Icon } from '@/components/ui';

/** Shown until the email is verified: shared apartments can't reach an unverified address. */
export function VerifyNotice({ account }: { account: Account }) {
  const { t } = useI18n();
  if (account.emailVerified) return null;
  return (
    <div className="notice">
      {Icon.alert}
      <span>
        <a href={`/sign-in?verify=${encodeURIComponent(account.email)}`}>{t('verify.link')}</a>
        {t('verify.rest')}
      </span>
    </div>
  );
}
