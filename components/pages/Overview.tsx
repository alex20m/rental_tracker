'use client';

import type { ApartmentView } from '@/lib/domain/types';
import { CATEGORIES } from '@/lib/domain/types';
import { computeTax, eur, MONTHS, ownerShare, pct } from '@/lib/domain/tax';
import type { Go } from '@/components/RentalApp';

export default function Overview({ apt, year, go }: { apt: ApartmentView; year: number; go: Go }) {
  const t = computeTax(apt, year);
  const mine = ownerShare(t, apt.mySharePct);
  const others = apt.owners.length - 1 + apt.invites.length;
  const shared = others > 0;
  const y = String(year);

  const rentByMonth = Array(12).fill(0) as number[];
  const costByMonth = Array(12).fill(0) as number[];
  apt.rents.forEach((r) => {
    if (r.status === 'paid' && r.receivedDate.startsWith(y)) rentByMonth[Number(r.receivedDate.slice(5, 7)) - 1]! += r.amount;
  });
  apt.costs.forEach((c) => {
    if (c.date.startsWith(y) && CATEGORIES[c.category].deductible) costByMonth[Number(c.date.slice(5, 7)) - 1]! += c.amount;
  });
  const max = Math.max(1, ...rentByMonth, ...costByMonth);

  const loggedMonths = t.paidMonths + t.vacantMonths + t.unpaidMonths;
  const occupancy = loggedMonths ? Math.round((t.paidMonths / loggedMonths) * 100) : null;
  const price = apt.settings.purchasePrice;
  const grossYield = price > 0 ? (t.rentIncome / price) * 100 : null;
  const netYield = price > 0 ? ((t.rentIncome - t.deductibleCosts) / price) * 100 : null;

  const recent = [
    ...apt.rents.map((r) => ({
      key: 'r' + r.month,
      date: r.receivedDate || r.month + '-01',
      title: r.status === 'paid' ? `Rent ${r.month}` : r.status === 'vacant' ? `Vacant ${r.month}` : `Unpaid ${r.month}`,
      amt: r.amount,
      sign: 1,
    })),
    ...apt.costs.map((c) => ({ key: 'c' + c.id, date: c.date, title: c.description || CATEGORIES[c.category].label, amt: c.amount, sign: -1 })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <>
      {!apt.settings.purchasePrice && (
        <div className="alert" onClick={() => go('settings')} style={{ cursor: 'pointer' }}>
          Add the purchase price and property details in the apartment settings →
        </div>
      )}
      {t.unloggedMonths > 0 && (
        <div className="alert" onClick={() => go('rent')} style={{ cursor: 'pointer' }}>
          {t.unloggedMonths} month{t.unloggedMonths > 1 ? 's' : ''} of {year} not logged yet →
        </div>
      )}

      <div className="card">
        {shared && <h2>Whole apartment</h2>}
        <div className="grid2">
          <div className="stat">
            <div className="v">{eur(t.rentIncome)}</div>
            <div className="l">Rent received</div>
          </div>
          <div className="stat">
            <div className="v">{eur(t.deductibleCosts)}</div>
            <div className="l">Deductible costs</div>
          </div>
          <div className="stat">
            <div className={'v ' + (t.netIncome >= 0 ? 'pos' : 'neg')}>{eur(t.netIncome)}</div>
            <div className="l">Taxable net income</div>
          </div>
          {!shared && (
            <div className="stat">
              <div className="v">{eur(t.estimatedTax)}</div>
              <div className="l">Est. tax</div>
            </div>
          )}
        </div>
      </div>

      {shared && (
        <div className="card" onClick={() => go('settings')} style={{ cursor: 'pointer' }}>
          <h2>Your share · {pct(apt.mySharePct)}</h2>
          <div className="grid2">
            <div className="stat">
              <div className={'v ' + (mine.netIncome >= 0 ? 'pos' : 'neg')}>{eur(mine.netIncome)}</div>
              <div className="l">Your taxable net income</div>
            </div>
            <div className="stat">
              <div className="v">{eur(mine.estimatedTax)}</div>
              <div className="l">Est. tax on your share</div>
            </div>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            Owned with {others} other{others === 1 ? '' : 's'}
            {apt.invites.length ? ` (${apt.invites.length} invited, not joined yet)` : ''} — tap to see the owners.
          </div>
        </div>
      )}

      <div className="card">
        <h2>Occupancy &amp; yield</h2>
        <div className="grid2">
          <div className="stat">
            <div className="v">{occupancy === null ? '—' : occupancy + '%'}</div>
            <div className="l">
              {t.paidMonths} paid · {t.vacantMonths} vacant{t.unpaidMonths ? ` · ${t.unpaidMonths} unpaid` : ''}
            </div>
          </div>
          <div className="stat">
            <div className="v">{grossYield === null ? '—' : grossYield.toFixed(1) + '%'}</div>
            <div className="l">Gross yield{netYield !== null ? ` · net ${netYield.toFixed(1)}%` : ''}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Rent vs. costs by month</h2>
        <div className="bars" role="img" aria-label="Monthly rent and cost bars">
          {MONTHS.map((m, i) => (
            <div className="col" key={m}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%', height: '100%' }}>
                <div className="bar" style={{ height: `${(rentByMonth[i]! / max) * 100}%` }} title={`${m} rent ${eur(rentByMonth[i]!)}`} />
                <div
                  className="bar"
                  style={{ height: `${(costByMonth[i]! / max) * 100}%`, background: 'var(--warn)' }}
                  title={`${m} costs ${eur(costByMonth[i]!)}`}
                />
              </div>
              <div className="lbl">{m[0]}</div>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: 8 }}>
          <span style={{ color: 'var(--brand)' }}>■</span> rent &nbsp; <span style={{ color: 'var(--warn)' }}>■</span> costs
        </div>
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        {recent.length === 0 ? (
          <div className="empty">Nothing logged yet. Start in the Rent log or Costs tab.</div>
        ) : (
          <ul className="list">
            {recent.map((r) => (
              <li key={r.key} style={{ cursor: 'default' }}>
                <div className="main">
                  <div className="t">{r.title}</div>
                  <div className="s">{r.date}</div>
                </div>
                <div className={r.sign > 0 ? 'pos' : ''} style={{ fontWeight: 600 }}>
                  {r.sign > 0 ? '+' : '−'}
                  {eur(r.amt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="btn primary block" onClick={() => go('tax')}>
        Prepare {year} tax declaration
      </button>
    </>
  );
}
