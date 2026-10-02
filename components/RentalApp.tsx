'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import { ErrorNote, Icon, YearPicker } from '@/components/ui';
import Portfolio from '@/components/pages/Portfolio';
import Overview from '@/components/pages/Overview';
import RentLog from '@/components/pages/RentLog';
import Costs from '@/components/pages/Costs';
import Tax from '@/components/pages/Tax';
import SettingsPage from '@/components/pages/SettingsPage';

export type Tab = 'portfolio' | 'overview' | 'rent' | 'costs' | 'tax' | 'settings';
export type Go = (t: Tab) => void;

type ApartmentTab = Exclude<Tab, 'portfolio' | 'settings'>;

const TABS: { id: Exclude<Tab, 'settings'>; label: string; icon: React.ReactNode }[] = [
  { id: 'portfolio', label: 'Portfolio', icon: Icon.portfolio },
  { id: 'overview', label: 'Overview', icon: Icon.home },
  { id: 'rent', label: 'Rent log', icon: Icon.rent },
  { id: 'costs', label: 'Costs', icon: Icon.cost },
  { id: 'tax', label: 'Tax', icon: Icon.tax },
];

const SELECTED_KEY = 'rental-tracker:selected-apartment';

function rememberSelected(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
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

type Snapshot = { account: Account; items: PortfolioItem[]; details: Record<string, ApartmentView> };

async function fetchSnapshot(): Promise<Snapshot> {
  const [me, list, profile] = await Promise.all([api.me(), api.portfolio(), api.profile()]);
  const views = await Promise.all(list.apartments.map((a) => api.apartment(a.id).catch(() => null)));
  return {
    account: { userId: me.userId, email: me.email, emailVerified: list.emailVerified, taxpayerName: profile.taxpayerName },
    items: list.apartments,
    details: Object.fromEntries(views.flatMap((v) => (v ? [[v.id, v]] : []))),
  };
}

export type Account = { userId: string; email: string; emailVerified: boolean; taxpayerName: string };

export default function RentalApp() {
  const router = useRouter();
  const thisYear = new Date().getFullYear();

  const [account, setAccount] = useState<Account | null>(null);
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [details, setDetails] = useState<Record<string, ApartmentView>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('portfolio');
  const [year, setYear] = useState(thisYear);
  const [error, setError] = useState('');

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) router.replace('/sign-in');
      else setError(e instanceof Error ? e.message : String(e));
    },
    [router],
  );

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

  useEffect(() => {
    rememberSelected(selectedId);
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
    const set = new Set<number>([thisYear, thisYear - 1]);
    for (const a of Object.values(details)) {
      a.rents.forEach((r) => set.add(Number(r.month.slice(0, 4))));
      a.costs.forEach((c) => set.add(Number(c.date.slice(0, 4))));
    }
    return [...set].filter(Boolean).sort((a, b) => b - a);
  }, [details, thisYear]);

  const open = (id: string, to: ApartmentTab = 'overview') => {
    setSelectedId(id);
    setTab(to);
  };

  if (!account || !items) {
    return (
      <div className="app">
        <ErrorNote message={error} />
        {!error && <div className="empty">Loading…</div>}
      </div>
    );
  }

  const needsApartment = tab !== 'portfolio' && !apt;
  const titles: Record<Tab, string> = {
    portfolio: 'Portfolio',
    overview: apt?.settings.name || 'Overview',
    rent: 'Rent log',
    costs: 'Costs & receipts',
    tax: 'Tax declaration',
    settings: 'Apartment settings',
  };

  return (
    <div className="app shell">
      <header className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1>{titles[tab]}</h1>
          {tab !== 'portfolio' && apt && items.length > 1 && (
            <select
              className="switcher"
              aria-label="Apartment"
              value={apt.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          )}
          {tab !== 'portfolio' && apt && items.length <= 1 && apt.settings.address && (
            <div className="sub">{apt.settings.address}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab !== 'settings' && <YearPicker year={year} years={years} onChange={setYear} />}
          {apt && tab !== 'portfolio' && (
            <button
              className="iconbtn"
              aria-label="Apartment settings"
              onClick={() => setTab(tab === 'settings' ? 'overview' : 'settings')}
            >
              {Icon.gear}
            </button>
          )}
        </div>
      </header>

      <ErrorNote message={error} />

      <main className={'page page-' + tab}>
        {tab === 'portfolio' && (
          <Portfolio
            items={items}
            details={details}
            year={year}
            account={account}
            onOpen={open}
            onChanged={loadPortfolio}
            onAccountChanged={(a) => setAccount(a)}
            onCreated={async (id) => {
              await loadPortfolio();
              open(id, 'overview');
            }}
          />
        )}
        {needsApartment && <div className="empty">Add an apartment on the Portfolio tab first.</div>}
        {apt && tab === 'overview' && <Overview apt={apt} year={year} go={setTab} />}
        {apt && tab === 'rent' && <RentLog apt={apt} year={year} onChanged={reloadSelected} />}
        {apt && tab === 'costs' && <Costs apt={apt} year={year} onChanged={reloadSelected} />}
        {apt && tab === 'tax' && <Tax apt={apt} year={year} taxpayerName={account.taxpayerName} go={setTab} />}
        {apt && tab === 'settings' && (
          <SettingsPage
            apt={apt}
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

      <nav className="nav" aria-label="Sections">
        <div className="nav-brand">Rental Tracker</div>
        <div className="nav-inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'on' : ''}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
