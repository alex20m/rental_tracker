'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { Icon } from '@/components/ui';
import type { Tab } from '@/components/RentalApp';

export const NAV_ID = 'app-nav';

type Props = {
  open: boolean;
  onClose: () => void;
  tab: Tab;
  /** Go to a page (and close the drawer). */
  onGo: (to: Tab) => void;
  /** The apartment being looked at, if there is one: its places are listed under its name. */
  apartment: string | null;
  /** Whether there is anything to list on the portfolio page. */
  hasApartments: boolean;
};

/**
 * Every place in the app, in one list. On a phone it is a drawer that slides in
 * from the left, opened by the ☰ in the top bar — nothing sits over the page
 * while you read it. From 960px wide it is a permanent sidebar and ☰ is gone.
 *
 * The apartment's own places come first, under its name; what is about you
 * rather than an apartment — the list of all apartments, the account — comes
 * after a divider, so the two kinds of settings are never mistaken for each other.
 */
export default function AppNav({ open, onClose, tab, onGo, apartment, hasApartments }: Props) {
  const { t } = useI18n();
  const nav = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Open: focus moves in, Escape closes, Tab stays inside.
  useEffect(() => {
    if (!open) return;
    const buttons = [...nav.current!.querySelectorAll('button')];
    buttons[0]!.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab') return;
      const first = buttons[0]!;
      const last = buttons[buttons.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const item = (to: Tab, icon: ReactNode, label: string, current: boolean) => (
    <button key={to} aria-current={current ? 'page' : undefined} onClick={() => onGo(to)}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <>
      {open && <div className="scrim" aria-hidden="true" onClick={onClose} />}
      <nav id={NAV_ID} ref={nav} className="nav" data-open={open} aria-label={t('nav.sections')}>
        <div className="nav-brand">{t('app.name')}</div>
        {apartment !== null && (
          <>
            <div className="nav-group">{apartment}</div>
            {item('home', Icon.home, t('nav.home'), tab === 'home')}
            {item('rent', Icon.rent, t('nav.ledger'), tab === 'rent' || tab === 'costs')}
            {item('tax', Icon.tax, t('nav.tax'), tab === 'tax' || tab === 'history')}
            {item('settings', Icon.gear, t('nav.settings'), tab === 'settings')}
            <div className="nav-sep" role="separator" />
          </>
        )}
        {hasApartments && item('portfolio', Icon.building, t('nav.allApartments'), tab === 'portfolio')}
        {item('account', Icon.user, t('nav.account'), tab === 'account')}
      </nav>
    </>
  );
}
