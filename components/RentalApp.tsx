'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import { ErrorNote, Icon, Segmented, YearSelect } from '@/components/ui';
import { useI18n } from '@/components/I18nProvider';
import AddApartment from '@/components/AddApartment';
import AppNav, { NAV_ID } from '@/components/AppNav';
import Portfolio from '@/components/pages/Portfolio';
import Home from '@/components/pages/Home';
import RentLog from '@/components/pages/RentLog';
import Costs from '@/components/pages/Costs';
import Tax from '@/components/pages/Tax';
import History from '@/components/pages/History';
import SettingsPage from '@/components/pages/SettingsPage';
import AccountPage from '@/components/pages/AccountPage';

export type Tab = 'home' | 'rent' | 'costs' | 'tax' | 'history' | 'settings' | 'portfolio' | 'account';
/** Where a tap can lead: a page. */
export type Destination = Tab;
export type Go = (to: Destination) => void;
/** Whose figures to show for an apartment owned by several people. */
export type Scope = 'mine' | 'whole';

const SELECTED_KEY = 'rental-tracker:selected-apartment';

function rememberSelected(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    /* storage unavailable — only a convenience */
  }
}

function recallSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

type Snapshot = {
  account: Account;
  items: PortfolioItem[];
  details: Record<string, ApartmentView>;
};

async function fetchSnapshot(): Promise<Snapshot> {
  const [me, list] = await Promise.all([api.me(), api.portfolio()]);
  const views = await Promise.all(list.apartments.map((a) => api.apartment(a.id).catch(() => null)));
  return {
    account: {
      userId: me.userId,
      email: me.email,
      emailVerified: list.emailVerified,
      name: me.name,
    },
    items: list.apartments,
    details: Object.fromEntries(views.flatMap((v) => (v ? [[v.id, v]] : []))),
  };
}

export type Account = {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

type LedgerView = 'rent' | 'costs';
type TaxView = 'tax' | 'history';

export default function RentalApp() {
  const { t } = useI18n();
  const thisYear = new Date().getFullYear();

  const [account, setAccount] = useState<Account | null>(null);
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [details, setDetails] = useState<Record<string, ApartmentView>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [year, setYear] = useState(thisYear);
  const [scope, setScope] = useState<Scope>('mine');
  const [navOpen, setNavOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState('');

  // A 401 has already sent the browser to /sign-in (lib/client/api.ts).
  const fail = useCallback((e: unknown) => setError((e as Error).message), []);

  const loadApartment = useCallback(
    async (id: string) => {
      try {
        const view = await api.apartment(id);
        setDetails((d) => ({ ...d, [id]: view }));
      } catch (e) {
        // Removed from it, or it was deleted by its other owner.
        if (e instanceof ApiError && e.status === 404) {
          setDetails(({ [id]: _gone, ...rest }) => rest);
        } else fail(e);
      }
    },
    [fail],
  );

  /** Applies a freshly fetched portfolio: the account, the list, and every apartment in it. */
  const apply = useCallback((snap: Snapshot) => {
    setAccount(snap.account);
    setItems(snap.items);
    setDetails(snap.details);
    setSelectedId((current) => {
      const wanted = current ?? recallSelected();
      const keep = snap.items.find((a) => a.id === wanted) ?? snap.items[0];
      return keep?.id ?? null;
    });
  }, []);

  const loadPortfolio = useCallback(async () => {
    try {
      apply(await fetchSnapshot());
    } catch (e) {
      fail(e);
    }
  }, [apply, fail]);

  useEffect(() => {
    fetchSnapshot().then(apply, fail);
  }, [apply, fail]);

  // Only ever written, never cleared: on load the selection is null until the
  // portfolio arrives, and clearing it then would forget the choice before it
  // is read. A stale id is harmless — `apply` falls back to the first apartment.
  useEffect(() => {
    if (selectedId) rememberSelected(selectedId);
  }, [selectedId]);

  /** After any change to the selected apartment: its details, and the portfolio row's summary. */
  const reloadSelected = useCallback(async () => {
    setError('');
    if (selectedId) await loadApartment(selectedId);
    const list = await api.portfolio().catch(fail);
    if (list) setItems(list.apartments);
  }, [selectedId, loadApartment, fail]);

  const apt = selectedId ? details[selectedId] : undefined;

  const years = useMemo(() => {
    const set = new Set<number>([thisYear]);
    for (const a of Object.values(details)) {
      a.rents.forEach((r) => set.add(Number(r.month.slice(0, 4))));
      a.costs.forEach((c) => set.add(Number(c.date.slice(0, 4))));
    }
    return [...set].filter(Boolean).sort((a, b) => b - a);
  }, [details, thisYear]);

  const go: Go = (to) => {
    setTab(to);
  };

  /** Close the drawer and put focus back on the ☰ that opened it. */
  const closeNav = () => {
    setNavOpen(false);
    toggle.current!.focus();
  };

  /** A place picked in the drawer. */
  const goFromNav: Go = (to) => {
    go(to);
    closeNav();
  };

  /** Open an apartment from the portfolio, at its Home. */
  const open = (id: string) => {
    setSelectedId(id);
    setTab('home');
  };

  if (!account || !items) {
    return (
      <div className="app">
        <ErrorNote message={error} />
        {!error && <div className="spinner" role="status" aria-label={t('common.loading')} />}
      </div>
    );
  }

  const onAccount = tab === 'account';
  const inPortfolio = tab === 'portfolio';
  const welcome = items.length === 0 && !onAccount;
  const inApartment = !welcome && !inPortfolio && !onAccount;
  const aptName = apt?.settings.name ?? items.find((i) => i.id === selectedId)?.name ?? '…';
  // The year matters wherever there are figures for it; settings, history and the account have none.
  const showYear = !welcome && tab !== 'settings' && tab !== 'history' && !onAccount;

  return (
    <div className="app shell">
      <header className="topbar">
        <button
          ref={toggle}
          className="iconbtn menu-toggle"
          aria-label={t('nav.menu')}
          aria-expanded={navOpen}
          aria-controls={NAV_ID}
          onClick={() => setNavOpen((o) => !o)}
        >
          {Icon.menu}
        </button>
        {inApartment ? <h1 className="grow aptname">{aptName}</h1> : <div className="grow brand">{t('app.name')}</div>}
        {showYear && <YearSelect year={year} years={years} onChange={setYear} />}
      </header>

      <ErrorNote message={error} />

      {welcome && (
        <div className="welcome">
          <div className="logo">{Icon.logo}</div>
          <div>
            <h1>{t('welcome.title')}</h1>
            <p className="lead" style={{ marginTop: 8 }}>
              {t('welcome.lead')}
            </p>
          </div>
          <AddApartment
            autoFocus
            onCreated={async (id) => {
              await loadPortfolio();
              open(id);
            }}
          />
        </div>
      )}

      {!welcome && (
        <main className={'page page-' + tab}>
          {onAccount && <AccountPage account={account} />}
          {inPortfolio && (
            <Portfolio
              items={items}
              details={details}
              year={year}
              account={account}
              onOpen={open}
              onCreated={async (id) => {
                await loadPortfolio();
                open(id);
              }}
            />
          )}
          {inApartment && !apt && (
            <div className="empty">
              {t('nav.loadFailed')}
              <button className="btn" onClick={() => selectedId && void loadApartment(selectedId)}>
                {t('nav.tryAgain')}
              </button>
            </div>
          )}
          {apt && tab === 'home' && (
            <Home apt={apt} year={year} account={account} scope={scope} onScope={setScope} go={go} />
          )}
          {apt && (tab === 'rent' || tab === 'costs') && (
            <Segmented<LedgerView>
              label={t('ledger.view')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'rent', label: t('nav.rent') },
                { value: 'costs', label: t('nav.costs') },
              ]}
            />
          )}
          {apt && tab === 'rent' && <RentLog apt={apt} year={year} onChanged={reloadSelected} />}
          {apt && tab === 'costs' && <Costs apt={apt} year={year} onChanged={reloadSelected} />}
          {apt && (tab === 'tax' || tab === 'history') && (
            <Segmented<TaxView>
              label={t('tax.view')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'tax', label: t('tax.thisYear') },
                { value: 'history', label: t('tax.allYears') },
              ]}
            />
          )}
          {apt && tab === 'tax' && (
            <Tax apt={apt} year={year} taxpayerName={account.name} scope={scope} onScope={setScope} go={go} />
          )}
          {apt && tab === 'history' && (
            <History
              apt={apt}
              thisYear={thisYear}
              scope={scope}
              onScope={setScope}
              onPick={(y) => {
                setYear(y);
                setTab('tax');
              }}
            />
          )}
          {apt && tab === 'settings' && (
            <SettingsPage
              apt={apt}
              year={year}
              account={account}
              onChanged={reloadSelected}
              onGone={async () => {
                setSelectedId(null);
                setTab('portfolio');
                await loadPortfolio();
              }}
            />
          )}
        </main>
      )}

      <AppNav
        open={navOpen}
        onClose={closeNav}
        tab={tab}
        onGo={goFromNav}
        apartment={items.length > 0 && selectedId ? aptName : null}
        hasApartments={items.length > 0}
      />
    </div>
  );
}
