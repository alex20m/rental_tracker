'use client';

import type { ApartmentView } from '@/lib/domain/types';
import { CATEGORIES } from '@/lib/domain/types';
import { computeTax, eur, MONTHS, ownerShare } from '@/lib/domain/tax';
import { buildChecklist } from '@/lib/domain/checklist';
import { eurWhole, shortDate } from '@/lib/ui/format';
import type { Account, Go, Scope } from '@/components/RentalApp';
import ScopeToggle from '@/components/ScopeToggle';
import { VerifyNotice } from '@/components/Notices';
import { Heading, Icon, Info, Money } from '@/components/ui';

type Props = { apt: ApartmentView; year: number; account: Account; scope: Scope; onScope: (s: Scope) => void; go: Go };

export default function Home({ apt, year, account, scope, onScope, go }: Props) {
  const t = computeTax(apt, year);
  const mine = ownerShare(t, apt.mySharePct);
  const shared = apt.mySharePct !== 100;
  const f = shared && scope === 'whole' ? t : mine;
  const y = String(year);

  const todo = buildChecklist({ apt, tax: t, taxpayerName: account.taxpayerName }).filter((i) => !i.ok);
  const hasData = apt.rents.some((r) => r.month.startsWith(y)) || apt.costs.some((c) => c.date.startsWith(y));

  const rentByMonth = Array(12).fill(0) as number[];
  const costByMonth = Array(12).fill(0) as number[];
  apt.rents.forEach((r) => {
    if (r.status === 'paid' && r.receivedDate.startsWith(y))
      rentByMonth[Number(r.receivedDate.slice(5, 7)) - 1]! += r.amount;
  });
  apt.costs.forEach((c) => {
    if (c.date.startsWith(y) && CATEGORIES[c.category].deductible)
      costByMonth[Number(c.date.slice(5, 7)) - 1]! += c.amount;
  });
  const max = Math.max(1, ...rentByMonth, ...costByMonth);
  const now = new Date();
  const currentMonth = now.getFullYear() === year ? now.getMonth() : -1;

  const loggedMonths = t.paidMonths + t.vacantMonths + t.unpaidMonths;
  const occupancy = loggedMonths ? Math.round((t.paidMonths / loggedMonths) * 100) : null;
  const price = apt.settings.purchasePrice;
  const grossYield = price > 0 ? (t.rentIncome / price) * 100 : null;
  const netYield = price > 0 ? ((t.rentIncome - t.deductibleCosts) / price) * 100 : null;

  const recent = [
    ...apt.rents.map((r) => ({
      key: 'r' + r.month,
      to: 'rent' as const,
      date: r.receivedDate || r.month + '-01',
      title:
        r.status === 'paid' ? `Rent ${r.month}` : r.status === 'vacant' ? `Vacant ${r.month}` : `Unpaid ${r.month}`,
      amt: r.amount,
      sign: 1,
    })),
    ...apt.costs.map((c) => ({
      key: 'c' + c.id,
      to: 'costs' as const,
      date: c.date,
      title: c.description || CATEGORIES[c.category].label,
      amt: c.amount,
      sign: -1,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <>
      <VerifyNotice account={account} />

      <section className="hero">
        {shared && <ScopeToggle sharePct={apt.mySharePct} scope={scope} onScope={onScope} />}
        <div className="label" style={{ marginTop: shared ? 10 : 0 }}>
          {f.netIncome < 0 ? 'Rental loss' : 'Net rental income'} · {year}
          <Info about="net income">
            Rent received, minus deductible costs and depreciation — the amount you are taxed on.
          </Info>
        </div>
        <div className={'big ' + (f.netIncome < 0 ? 'neg' : '')} data-testid="net-income">
          <Money value={f.netIncome} />
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{eurWhole(f.rentIncome)}</div>
            <div className="l">Rent</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(f.deductibleCosts + f.depreciation)}</div>
            <div className="l">
              Deductions
              <Info about="deductions">
                Deductible costs plus depreciation. Financing charges aren’t deductible and are left out.
              </Info>
            </div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(f.estimatedTax)}</div>
            <div className="l">
              Est. tax
              <Info about="the tax estimate">
                30 % up to €30 000 of capital income, 34 % above{shared && scope === 'mine' ? ', on your share' : ''}. A
                rough estimate — other capital income isn’t included.
              </Info>
            </div>
          </div>
        </div>
      </section>

      {todo.length > 0 ? (
        <section>
          <Heading>To do</Heading>
          <div className="card todo">
            {todo.map((i) => (
              <button key={i.id} className="row-btn" onClick={() => go(i.to)}>
                <span className="dot">{Icon.alert}</span>
                <span className="main">{i.text}</span>
                {Icon.right}
              </button>
            ))}
          </div>
        </section>
      ) : (
        hasData && (
          <div className="allset">
            {Icon.check} Ready for the {year} declaration
          </div>
        )
      )}

      <section>
        <Heading>Rent and costs by month</Heading>
        <div
          className="bars"
          role="img"
          aria-label={`Rent received ${eur(rentByMonth.reduce((a, b) => a + b, 0))} and costs ${eur(costByMonth.reduce((a, b) => a + b, 0))} in ${year}, by month`}
        >
          {MONTHS.map((m, i) => (
            <div className={'col' + (i === currentMonth ? ' now' : '')} key={m}>
              <div className="pair">
                <div
                  className="bar"
                  style={{ height: `${(rentByMonth[i]! / max) * 100}%` }}
                  title={`${m} rent ${eur(rentByMonth[i]!)}`}
                />
                <div
                  className="bar cost"
                  style={{ height: `${(costByMonth[i]! / max) * 100}%` }}
                  title={`${m} costs ${eur(costByMonth[i]!)}`}
                />
              </div>
              <div className="lbl">{m[0]}</div>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i />
            Rent
          </span>
          <span>
            <i className="cost" />
            Costs
          </span>
        </div>
      </section>

      <section className="stats two" style={{ marginTop: 0 }}>
        <div className="stat">
          <div className="v">{occupancy === null ? '—' : occupancy + ' %'}</div>
          <div className="l">
            Occupancy
            <Info about="occupancy">
              The share of logged months you received rent: {t.paidMonths} paid, {t.vacantMonths} vacant
              {t.unpaidMonths ? `, ${t.unpaidMonths} unpaid` : ''}.
            </Info>
          </div>
        </div>
        <div className="stat">
          <div className="v">{grossYield === null ? '—' : grossYield.toFixed(1) + ' %'}</div>
          <div className="l">
            Yield
            <Info about="yield">
              Gross yield is the rent received divided by the purchase price
              {netYield !== null ? `; after deductible costs it is ${netYield.toFixed(1)} %` : ''}.
              {price <= 0 ? ' Add the purchase price in the apartment settings to see it.' : ''}
            </Info>
          </div>
        </div>
      </section>

      <section>
        <Heading>Recent</Heading>
        {recent.length === 0 ? (
          <div className="empty">
            Nothing logged yet.
            <button className="btn primary" onClick={() => go('rent')}>
              Log the first rent
            </button>
          </div>
        ) : (
          <ul className="list">
            {recent.map((r) => (
              <li key={r.key}>
                <button className="row-btn" onClick={() => go(r.to)}>
                  <div className="main">
                    <div className="t">{r.title}</div>
                    <div className="s">{shortDate(r.date)}</div>
                  </div>
                  <div className={'strong num ' + (r.sign > 0 ? 'pos' : '')}>
                    {r.sign > 0 ? '+' : '−'}
                    {eur(r.amt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn quiet block" onClick={() => go('tax')}>
        Prepare the {year} declaration
      </button>
    </>
  );
}
