import { useState } from 'react';
import type { DB } from '../types';
import { computeTax, eur } from '../tax';
import { buildPackage, buildPdf, download } from '../declaration';

type Go = (t: 'rent' | 'costs' | 'tax' | 'settings') => void;

export default function Tax({ db, year, go }: { db: DB; year: number; go: Go }) {
  const t = computeTax(db, year);
  const [busy, setBusy] = useState(false);
  const s = db.settings;

  const warnings: { text: string; to: 'rent' | 'costs' | 'settings' }[] = [];
  if (!s.taxpayerName) warnings.push({ text: 'Taxpayer name is missing', to: 'settings' });
  if (!s.purchasePrice) warnings.push({ text: 'Purchase price missing (needed for depreciation and yield)', to: 'settings' });
  if (t.unloggedMonths) warnings.push({ text: `${t.unloggedMonths} month(s) not logged in the rent log`, to: 'rent' });
  if (t.unpaidMonths) warnings.push({ text: `${t.unpaidMonths} month(s) marked unpaid — not counted as income`, to: 'rent' });
  if (t.costsWithoutReceipt) warnings.push({ text: `${t.costsWithoutReceipt} cost(s) have no receipt photo`, to: 'costs' });

  const makePackage = async () => {
    setBusy(true);
    try {
      download(await buildPackage(db, year), `rental-tax-${year}.zip`);
    } catch (e) {
      alert('Could not build the package: ' + (e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      {warnings.map((w) => (
        <div key={w.text} className="alert" style={{ cursor: 'pointer' }} onClick={() => go(w.to)}>
          {w.text} →
        </div>
      ))}

      <div className="card">
        <h2>Income (Vuokratulot)</h2>
        <div className="kv">
          <span>Rent received in {year}</span>
          <b>{eur(t.rentIncome)}</b>
        </div>
        <div className="note">
          {t.paidMonths} paid · {t.vacantMonths} vacant · {t.unpaidMonths} unpaid
        </div>
      </div>

      <div className="card">
        <h2>Expenses (Menot)</h2>
        {t.lines.length === 0 && <div className="note">No costs logged for {year}.</div>}
        {t.lines.map((l) => (
          <div className="kv" key={l.category} style={l.deductible ? undefined : { opacity: 0.6 }}>
            <span>
              {l.label} <span className="note">({l.fi})</span>
              {!l.deductible && <span className="chip warn" style={{ marginLeft: 6 }}>not deductible</span>}
            </span>
            <span>{eur(l.amount)}</span>
          </div>
        ))}
        {t.depreciation > 0 && (
          <div className="kv">
            <span>
              Depreciation <span className="note">(Poisto)</span>
            </span>
            <span>{eur(t.depreciation)}</span>
          </div>
        )}
        <div className="kv total">
          <span>Deductible total</span>
          <span>{eur(t.deductibleCosts + t.depreciation)}</span>
        </div>
      </div>

      <div className="card">
        <h2>Result</h2>
        <div className="kv total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
          <span>{t.netIncome >= 0 ? 'Taxable rental income' : 'Rental loss'}</span>
          <span className={t.netIncome >= 0 ? '' : 'neg'}>{eur(t.netIncome)}</span>
        </div>
        <div className="kv">
          <span>Estimated capital income tax</span>
          <b>{eur(t.estimatedTax)}</b>
        </div>
        <div className="note">30% up to €30 000, 34% above. Estimate only — other capital income and deductions are not included.</div>
      </div>

      <button className="btn primary block" onClick={makePackage} disabled={busy}>
        {busy ? 'Building…' : `Generate ${year} declaration (.zip)`}
      </button>
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => download(buildPdf(db, t), `vuokratulot-ja-menot-${year}.pdf`)}>
        PDF summary only
      </button>
      <p className="note" style={{ marginTop: 12 }}>
        The zip contains a PDF summary laid out like the Finnish rental income form (lomake 9 / OmaVero fields), a CSV ledger and all receipt photos. Filing itself
        is done by you in OmaVero — this app has no direct connection to Vero.
      </p>
    </>
  );
}
