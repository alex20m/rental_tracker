'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import { Avatar, ErrorNote, Icon, Segmented, YearStepper } from '@/components/ui';
import { useI18n } from '@/components/I18nProvider';
import AddApartment from '@/components/AddApartment';
import MenuSheet from '@/components/MenuSheet';
import Portfolio from '@/components/pages/Portfolio';
import Home from '@/components/pages/Home';
import RentLog from '@/components/pages/RentLog';
import Costs from '@/components/pages/Costs';
import Tax from '@/components/pages/Tax';
import History from '@/components/pages/History';
import SettingsPage from '@/components/pages/SettingsPage';

export type Tab = 'home' | 'rent' | 'costs' | 'tax' | 'history' | 'settings' | 'portfolio';
/** Where a tap can lead: a page. */
export type Destination = Tab;
export type Go = (to: Destination) => void;
/** Whose figures to show for an apartment owned by several people. */
export type Scope = 'mine' | 'whole';

/**
 * The bottom navigation: four places. Rent and costs share one tab, and so do
 * this year's tax and all years; a switch at the top of each tells them apart.
 */
const SECTIONS = [
  { id: 'home', icon: Icon.home },
  { id: 'ledger', icon: Icon.rent },
  { id: 'tax', icon: Icon.tax },
  { id: 'settings', icon: Icon.gear },
] as const;

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

type SheetName = 'menu' | null;
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
  const [sheet, setSheet] = useState<SheetName>(null);
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
    const set = new Set<number>([thisYear, thisYear - 1]);
    for (const a of Object.values(details)) {
      a.rents.forEach((r) => set.add(Number(r.month.slice(0, 4))));
      a.costs.forEach((c) => set.add(Number(c.date.slice(0, 4))));
    }
    return [...set].filter(Boolean).sort((a, b) => b - a);
  }, [details, thisYear]);

  const go: Go = (to) => {
    setTab(to);
  };

  /** Open an apartment from the portfolio, at its Home. */
  const open = (id: string) => {
    setSelectedId(id);
    setTab('home');
    setSheet(null);
  };

  if (!account || !items) {
    return (
      <div className="app">
        <ErrorNote message={error} />
        {!error && <div className="spinner" role="status" aria-label={t('common.loading')} />}
      </div>
    );
  }

  const menuButton = (
    <button className="menubtn" aria-label={t('nav.menu')} onClick={() => setSheet('menu')}>
      <Avatar text={account.name} />
    </button>
  );

  const menuSheet = sheet === 'menu' && <MenuSheet account={account} onClose={() => setSheet(null)} />;

  // Nothing to show yet: one field, one button. The menu sheet is a sibling of
  // the layout, at the same place in both branches, so it stays mounted when
  // the first apartment turns this screen into the full app underneath it.
  if (items.length === 0) {
    return (
      <>
        <div className="app">
          <header className="topbar">
            <div className="grow brand">{t('app.name')}</div>
            {menuButton}
          </header>
          <ErrorNote message={error} />
          <div className="welcome">
            <div className="logo">{Icon.building}</div>
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
        </div>
        {menuSheet}
      </>
    );
  }

  const inPortfolio = tab === 'portfolio';
  const aptName = apt?.settings.name ?? items.find((i) => i.id === selectedId)?.name ?? '…';

  return (
    <>
      <div className="app shell">
        <header className="topbar">
          {inPortfolio ? (
            <div className="grow brand">{t('app.name')}</div>
          ) : (
            <>
              <button className="iconbtn" aria-label={t('nav.allApartments')} onClick={() => setTab('portfolio')}>
                {Icon.left}
              </button>
              <h1 className="grow aptname">{aptName}</h1>
            </>
          )}
          {tab !== 'settings' && tab !== 'history' && <YearStepper year={year} years={years} onChange={setYear} />}
          {inPortfolio && menuButton}
        </header>

        <ErrorNote message={error} />

        <main className={'page page-' + tab}>
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
          {!inPortfolio && !apt && (
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

        {inPortfolio && <div className="side-brand">{t('app.name')}</div>}
        {!inPortfolio && (
          <nav className="nav" aria-label={t('nav.sections')}>
            <div className="nav-brand">{t('app.name')}</div>
            <div className="nav-inner">
              {SECTIONS.map((s) => {
                const current =
                  s.id === 'ledger'
                    ? tab === 'rent' || tab === 'costs'
                    : s.id === 'tax'
                      ? tab === 'tax' || tab === 'history'
                      : tab === s.id;
                return (
                  <button
                    key={s.id}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => setTab(s.id === 'ledger' ? 'rent' : s.id)}
                  >
                    {s.icon}
                    <span>{t(`nav.${s.id}`)}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
      {menuSheet}
    </>
  );
}
