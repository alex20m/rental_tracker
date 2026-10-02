'use client';

import { useState } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { computeTax, eur, ownerShare, pct } from '@/lib/domain/tax';
import { buildPackage, buildPdf } from '@/lib/client/declaration';
import { download } from '@/lib/client/api';
import { ErrorNote } from '@/components/ui';
import type { Go } from '@/components/RentalApp';

type Props = { apt: ApartmentView; year: number; taxpayerName: string; go: Go };

export default function Tax({ apt, year, taxpayerName, go }: Props) {
  const t = computeTax(apt, year);
  const mine = ownerShare(t, apt.mySharePct);
  const shared = mine.sharePct !== 100;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = apt.settings;

  const warnings: { text: string; to: 'rent' | 'costs' | 'settings' | 'portfolio' }[] = [];
  if (!taxpayerName) warnings.push({ text: 'Your name for the declaration is missing', to: 'portfolio' });
  if (!s.purchasePrice) warnings.push({ text: 'Purchase price missing (needed for depreciation and yield)', to: 'settings' });
  if (t.unloggedMonths) warnings.push({ text: `${t.unloggedMonths} month(s) not logged in the rent log`, to: 'rent' });
  if (t.unpaidMonths) warnings.push({ text: `${t.unpaidMonths} month(s) marked unpaid — not counted as income`, to: 'rent' });
  if (t.costsWithoutReceipt) warnings.push({ text: `${t.costsWithoutReceipt} cost(s) have no receipt photo`, to: 'costs' });
  if (apt.invites.length) {
    warnings.push({ text: `${apt.invites.length} invited owner(s) haven't joined yet — check the shares are final`, to: 'settings' });
  }

  const makePackage = async () => {
    setBusy(true);
    setError('');
    try {
      download(await buildPackage(apt, year, taxpayerName), `rental-tax-${year}.zip`);
    } catch (e) {
      setError('Could not build the package: ' + (e as Error).message);
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

      {shared && (
        <div className="card">
          <h2>Your ownership: {pct(mine.sharePct)}</h2>
          <div className="note">
            Each owner declares their own share. Below, the grey figure is the whole apartment and the bold one is
            yours — that is what goes in your declaration.
          </div>
        </div>
      )}

      <div className="card">
        <h2>Income (Vuokratulot)</h2>
        <div className="kv">
          <span>Rent received in {year}</span>
          <Amount shared={shared} total={t.rentIncome} part={mine.rentIncome} />
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
              {!l.deductible && (
                <span className="chip warn" style={{ marginLeft: 6 }}>
                  not deductible
                </span>
              )}
            </span>
            <Amount shared={shared} total={l.amount} part={mine.lines.find((m) => m.category === l.category)!.amount} />
          </div>
        ))}
        {t.depreciation > 0 && (
          <div className="kv">
            <span>
              Depreciation <span className="note">(Poisto)</span>
            </span>
            <Amount shared={shared} total={t.depreciation} part={mine.depreciation} />
          </div>
        )}
        <div className="kv total">
          <span>Deductible total</span>
          <Amount shared={shared} total={t.deductibleCosts + t.depreciation} part={mine.deductibleCosts + mine.depreciation} />
        </div>
      </div>

      <div className="card">
        <h2>Result</h2>
        <div className="kv total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
          <span>{mine.netIncome >= 0 ? 'Taxable rental income' : 'Rental loss'}</span>
          <span className={mine.netIncome >= 0 ? '' : 'neg'}>
            <Amount shared={shared} total={t.netIncome} part={mine.netIncome} />
          </span>
        </div>
        <div className="kv">
          <span>Estimated capital income tax{shared ? ' on your share' : ''}</span>
          <b>{eur(mine.estimatedTax)}</b>
        </div>
        <div className="note">
          30% up to €30 000, 34% above. Estimate only — other capital income and deductions are not included. The
          Portfolio tab estimates it on all your apartments together.
        </div>
      </div>

      <ErrorNote message={error} />
      <button className="btn primary block" onClick={makePackage} disabled={busy}>
        {busy ? 'Building…' : `Generate ${year} declaration (.zip)`}
      </button>
      <button
        className="btn block"
        style={{ marginTop: 8 }}
        onClick={() => download(buildPdf(apt, t, mine, taxpayerName), `vuokratulot-ja-menot-${year}.pdf`)}
      >
        PDF summary only
      </button>
      <p className="note" style={{ marginTop: 12 }}>
        The zip contains a PDF summary laid out like the Finnish rental income form (lomake 9 / OmaVero fields)
        {shared ? ' with your share of every amount' : ''}, a CSV ledger and all receipt photos. Filing itself is
        done by you in OmaVero — this app has no direct connection to Vero.
      </p>
    </>
  );
}

/** A figure for the whole apartment, with the viewer's part beside it when co-owned. */
function Amount({ shared, total, part }: { shared: boolean; total: number; part: number }) {
  return shared ? (
    <span className="pair">
      <span className="note">{eur(total)}</span>
      <b>{eur(part)}</b>
    </span>
  ) : (
    <span>{eur(total)}</span>
  );
}
