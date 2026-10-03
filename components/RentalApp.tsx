'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { pct } from '@/lib/domain/tax';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import { Avatar, ErrorNote, Icon, Sheet, YearStepper } from '@/components/ui';
import { useI18n } from '@/components/I18nProvider';
import AddApartment from '@/components/AddApartment';
import MenuSheet from '@/components/MenuSheet';
import Portfolio from '@/components/pages/Portfolio';
import Home from '@/components/pages/Home';
import RentLog from '@/components/pages/RentLog';
import Costs from '@/components/pages/Costs';
import Tax from '@/components/pages/Tax';
import SettingsPage from '@/components/pages/SettingsPage';

export type Tab = 'home' | 'rent' | 'costs' | 'tax' | 'settings' | 'portfolio';
/** Where a tap can lead: a page, or the account menu. */
export type Destination = Tab | 'account';
export type Go = (to: Destination) => void;
/** Whose figures to show for an apartment owned by several people. */
export type Scope = 'mine' | 'whole';

const SECTIONS = [
  { id: 'home', icon: Icon.home },
  { id: 'rent', icon: Icon.rent },
  { id: 'costs', icon: Icon.cost },
  { id: 'tax', icon: Icon.tax },
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

type Snapshot = { account: Account; items: PortfolioItem[]; details: Record<string, ApartmentView> };

async function fetchSnapshot(): Promise<Snapshot> {
  const [me, list, profile] = await Promise.all([api.me(), api.portfolio(), api.profile()]);
  const views = await Promise.all(list.apartments.map((a) => api.apartment(a.id).catch(() => null)));
  return {
    account: {
      userId: me.userId,
      email: me.email,
      emailVerified: list.emailVerified,
      taxpayerName: profile.taxpayerName,
    },
    items: list.apartments,
    details: Object.fromEntries(views.flatMap((v) => (v ? [[v.id, v]] : []))),
  };
}

export type Account = { userId: string; email: string; emailVerified: boolean; taxpayerName: string };

type SheetName = 'switch' | 'menu' | null;

export default function RentalApp() {
  const router = useRouter();
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
  const [adding, setAdding] = useState(false);
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
    if (to === 'account') setSheet('menu');
    else setTab(to);
  };

  /** Pick an apartment; stay on the same section so switching never loses your place. */
  const open = (id: string) => {
    setSelectedId(id);
    setTab((t) => (t === 'portfolio' || t === 'settings' ? 'home' : t));
    setSheet(null);
    setAdding(false);
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
      <Avatar text={account.taxpayerName || account.email} />
    </button>
  );

  const menuSheet = sheet === 'menu' && (
    <MenuSheet
      account={account}
      apartmentName={apt?.settings.name}
      onSettings={() => {
        setSheet(null);
        setTab('settings');
      }}
      onClose={() => setSheet(null)}
      onAccountChanged={setAccount}
      onImported={loadPortfolio}
    />
  );

  // Nothing to show yet: one field, one button. The menu sheet is a sibling of
  // the layout, at the same place in both branches, so it stays mounted (and
  // keeps its "Imported …" message) when an import turns this screen into the
  // full app underneath it.
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
            <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet('menu')}>
              {t('welcome.import')}
            </button>
          </div>
        </div>
        {menuSheet}
      </>
    );
  }

  const inPortfolio = tab === 'portfolio';
  const pillName = inPortfolio
    ? t('nav.allApartments')
    : (apt?.settings.name ?? items.find((i) => i.id === selectedId)?.name ?? '…');

  return (
    <>
      <div className="app shell">
        <header className="topbar">
          <div className="grow">
            <button className="pill" aria-haspopup="dialog" onClick={() => setSheet('switch')}>
              <span>{pillName}</span>
              {Icon.down}
            </button>
          </div>
          {tab !== 'settings' && <YearStepper year={year} years={years} onChange={setYear} />}
          {menuButton}
        </header>

        <ErrorNote message={error} />

        <main className={'page page-' + tab}>
          {inPortfolio && <Portfolio items={items} details={details} year={year} account={account} onOpen={open} />}
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
          {apt && tab === 'rent' && <RentLog apt={apt} year={year} onChanged={reloadSelected} />}
          {apt && tab === 'costs' && <Costs apt={apt} year={year} onChanged={reloadSelected} />}
          {apt && tab === 'tax' && (
            <Tax apt={apt} year={year} taxpayerName={account.taxpayerName} scope={scope} onScope={setScope} go={go} />
          )}
          {apt && tab === 'settings' && (
            <SettingsPage
              apt={apt}
              account={account}
              onBack={() => setTab('home')}
              onChanged={reloadSelected}
              onGone={async () => {
                setSelectedId(null);
                setTab('home');
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
              {SECTIONS.map((s) => (
                <button key={s.id} aria-current={tab === s.id ? 'page' : undefined} onClick={() => setTab(s.id)}>
                  {s.icon}
                  <span>{t(`nav.${s.id}`)}</span>
                </button>
              ))}
            </div>
          </nav>
        )}

        {sheet === 'switch' && (
          <Sheet
            title={t('nav.apartments')}
            onClose={() => {
              setSheet(null);
              setAdding(false);
            }}
          >
            <ul className="list">
              {items.length > 1 && (
                <li>
                  <button
                    className="row-btn"
                    onClick={() => {
                      setTab('portfolio');
                      setSheet(null);
                    }}
                  >
                    {Icon.stack}
                    <div className="main">
                      <div className="t">{t('nav.allApartments')}</div>
                      <div className="s">{t('nav.allApartmentsHint')}</div>
                    </div>
                    {inPortfolio && Icon.check}
                  </button>
                </li>
              )}
              {items.map((i) => (
                <li key={i.id}>
                  <button className="row-btn" onClick={() => open(i.id)}>
                    {Icon.building}
                    <div className="main">
                      <div className="t">{i.name}</div>
                      <div className="s">
                        {[i.mySharePct !== 100 && t('nav.shareYours', { pct: pct(i.mySharePct) }), i.address]
                          .filter(Boolean)
                          .join(' · ') || t('common.yours')}
                      </div>
                    </div>
                    {!inPortfolio && i.id === selectedId && Icon.check}
                  </button>
                </li>
              ))}
            </ul>
            {adding ? (
              <div style={{ marginTop: 16 }}>
                <AddApartment
                  autoFocus
                  onCreated={async (id) => {
                    await loadPortfolio();
                    open(id);
                  }}
                />
              </div>
            ) : (
              <button
                className="row-btn"
                style={{ borderBottom: 0, color: 'var(--brand)', fontWeight: 600 }}
                onClick={() => setAdding(true)}
              >
                {Icon.plus}
                <div className="main">{t('nav.newApartment')}</div>
              </button>
            )}
          </Sheet>
        )}
      </div>
      {menuSheet}
    </>
  );
}
