import { useRef, useState } from 'react';
import type { DB, Settings } from '../types';
import { exportBackup, importBackup, update } from '../store';
import { download } from '../declaration';
import { computeDepreciation, eur } from '../tax';

export default function SettingsPage({ db }: { db: DB }) {
  const s = db.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (Number(e.target.value) || 0) as never);
  const text = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never);

  return (
    <>
      <div className="card">
        <h2>Taxpayer</h2>
        <label>Name</label>
        <input value={s.taxpayerName} onChange={text('taxpayerName')} />
        <div className="note" style={{ marginTop: 6 }}>
          Don't enter your personal identity number — it isn't needed and the data is stored in this browser.
        </div>
      </div>

      <div className="card">
        <h2>Property</h2>
        <label>Name</label>
        <input value={s.propertyName} onChange={text('propertyName')} />
        <label>Address</label>
        <input value={s.address} onChange={text('address')} />
        <label>Housing company (asunto-osakeyhtiö)</label>
        <input value={s.housingCompany} onChange={text('housingCompany')} />
        <div className="row">
          <div>
            <label>Purchase date</label>
            <input type="date" value={s.purchaseDate} onChange={text('purchaseDate')} />
          </div>
          <div>
            <label>Purchase price (€)</label>
            <input type="number" inputMode="decimal" value={s.purchasePrice || ''} onChange={num('purchasePrice')} />
          </div>
        </div>
        <label>Usual monthly rent (€)</label>
        <input type="number" inputMode="decimal" value={s.monthlyRent || ''} onChange={num('monthlyRent')} />
      </div>

      <div className="card">
        <h2>Depreciation (poisto)</h2>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text)' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={s.useDepreciation} onChange={(e) => set('useDepreciation', e.target.checked)} />
          Deduct depreciation in the declaration
        </label>
        {s.useDepreciation && (
          <>
            <div className="row">
              <div>
                <label>Depreciable share (%)</label>
                <input type="number" inputMode="decimal" value={s.buildingSharePct} onChange={num('buildingSharePct')} />
              </div>
              <div>
                <label>Rate (% / year)</label>
                <input type="number" inputMode="decimal" step="0.1" value={s.depreciationRate} onChange={num('depreciationRate')} />
              </div>
            </div>
            <label>Already depreciated in earlier years (€)</label>
            <input type="number" inputMode="decimal" value={s.depreciationPrior || ''} onChange={num('depreciationPrior')} />
            <div className="note" style={{ marginTop: 8 }}>
              Current yearly depreciation: <b>{eur(computeDepreciation(db))}</b>. 2.5% on the remaining cost is the usual rate for apartments; check vero.fi for your
              case.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Backup</h2>
        <div className="note" style={{ marginBottom: 10 }}>
          Everything lives in this browser. Export a backup now and then — it includes receipt photos.
        </div>
        <div className="row">
          <button className="btn" onClick={async () => download(await exportBackup(), `rental-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!confirm('Importing replaces all current data. Continue?')) return;
            try {
              await importBackup(f);
              setMsg('Backup imported.');
            } catch (err) {
              setMsg('Import failed: ' + (err as Error).message);
            }
          }}
        />
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
    </>
  );
}
