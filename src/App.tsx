import { useMemo, useState } from 'react';
import { useDB } from './store';
import { Icon, YearPicker } from './ui';
import Overview from './pages/Overview';
import RentLog from './pages/RentLog';
import Costs from './pages/Costs';
import Tax from './pages/Tax';
import SettingsPage from './pages/SettingsPage';

type Tab = 'overview' | 'rent' | 'costs' | 'tax' | 'settings';

const TABS: { id: Exclude<Tab, 'settings'>; label: string; icon: JSX.Element }[] = [
  { id: 'overview', label: 'Overview', icon: Icon.home },
  { id: 'rent', label: 'Rent log', icon: Icon.rent },
  { id: 'costs', label: 'Costs', icon: Icon.cost },
  { id: 'tax', label: 'Tax', icon: Icon.tax },
];

export default function App() {
  const db = useDB();
  const [tab, setTab] = useState<Tab>('overview');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const years = useMemo(() => {
    const set = new Set<number>([thisYear, thisYear - 1]);
    db.rents.forEach((r) => set.add(Number(r.month.slice(0, 4))));
    db.costs.forEach((c) => set.add(Number(c.date.slice(0, 4))));
    return [...set].filter(Boolean).sort((a, b) => b - a);
  }, [db.rents, db.costs, thisYear]);

  const titles: Record<Tab, string> = {
    overview: db.settings.propertyName || 'Overview',
    rent: 'Rent log',
    costs: 'Costs & receipts',
    tax: 'Tax declaration',
    settings: 'Settings',
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{titles[tab]}</h1>
          {tab === 'overview' && db.settings.address && <div className="sub">{db.settings.address}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab !== 'settings' && <YearPicker year={year} years={years} onChange={setYear} />}
          <button className="iconbtn" aria-label="Settings" onClick={() => setTab(tab === 'settings' ? 'overview' : 'settings')}>
            {Icon.gear}
          </button>
        </div>
      </header>

      {tab === 'overview' && <Overview db={db} year={year} go={(t) => setTab(t)} />}
      {tab === 'rent' && <RentLog db={db} year={year} />}
      {tab === 'costs' && <Costs db={db} year={year} />}
      {tab === 'tax' && <Tax db={db} year={year} go={(t) => setTab(t)} />}
      {tab === 'settings' && <SettingsPage db={db} />}

      <nav className="nav">
        <div className="nav-inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
