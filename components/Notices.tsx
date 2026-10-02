'use client';

import type { Account } from '@/components/RentalApp';
import { Icon } from '@/components/ui';

/** Shown until the email is verified: shared apartments can't reach an unverified address. */
export function VerifyNotice({ account }: { account: Account }) {
  if (account.emailVerified) return null;
  return (
    <div className="notice">
      {Icon.alert}
      <span>
        <a href={`/sign-in?verify=${encodeURIComponent(account.email)}`}>Verify your email</a> to receive apartments
        other owners share with you.
      </span>
    </div>
  );
}
