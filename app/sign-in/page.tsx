import { Suspense } from 'react';
import SignIn from '@/components/SignIn';

export const metadata = { title: 'Sign in · Rental Tracker' };

export default function SignInPage() {
  // SignIn reads the query string, which only exists at request time.
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
