'use client';

import { useState } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { CATEGORIES } from '@/lib/domain/types';
import { computeTax, eur, ownerShare } from '@/lib/domain/tax';
import { buildChecklist } from '@/lib/domain/checklist';
import { buildPackage, buildPdf } from '@/lib/client/declaration';
import { download } from '@/lib/client/api';
import type { Go, Scope } from '@/components/RentalApp';
import ScopeToggle from '@/components/ScopeToggle';
import { ErrorNote, Heading, Icon, Info, Money } from '@/components/ui';

type Props = {
  apt: ApartmentView;
  year: number;
  taxpayerName: string;
  scope: Scope;
  onScope: (s: Scope) => void;
  go: Go;
};

export default function Tax({ apt, year, taxpayerName, scope, onScope, go }: Props) {
  const t = computeTax(apt, year);
  const mine = ownerShare(t, apt.mySharePct);
  const shared = apt.mySharePct !== 100;
  const f = shared && scope === 'whole' ? t : mine;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checklist = buildChecklist({ apt, tax: t, taxpayerName });

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
      <section className="hero">
        {shared && <ScopeToggle sharePct={apt.mySharePct} scope={scope} onScope={onScope} />}
        <div className="label" style={{ marginTop: shared ? 10 : 0 }}>
          {f.netIncome >= 0 ? 'Taxable rental income' : 'Rental loss'} · {year}
          {shared && (
            <Info about="co-ownership">
              Each owner declares their own share. “Your share” is what goes in your declaration; “Whole apartment” is
              for reference.
            </Info>
          )}
        </div>
        <div className={'big ' + (f.netIncome < 0 ? 'neg' : '')}>
          <Money value={f.netIncome} />
        </div>
        <div className="label" style={{ marginTop: 4 }}>
          Estimated tax{' '}
          <b className="num" style={{ margin: '0 2px', color: 'var(--text)' }}>
            {eur(f.estimatedTax)}
          </b>
          <Info about="the tax estimate">
            Capital income tax: 30 % up to €30 000, 34 % above. An estimate only — other capital income and deductions
            aren’t included. The all-apartments view estimates it on everything you own together.
          </Info>
        </div>
      </section>

      <section>
        <Heading>Before you file</Heading>
        <div className="card todo">
          {checklist.map((i) =>
            i.ok ? (
              <div key={i.id} className="row done" style={{ padding: '11px 0' }}>
                <span className="dot ok">{Icon.check}</span>
                <span className="main">{i.text}</span>
              </div>
            ) : (
              <button key={i.id} className="row-btn" onClick={() => go(i.to)}>
                <span className="dot">{Icon.alert}</span>
                <span className="main">{i.text}</span>
                {Icon.right}
              </button>
            ),
          )}
        </div>
      </section>

      <section className="section">
        <Heading>Income</Heading>
        <div className="kv">
          <span>
            Rent received
            <Info about="rent months">
              {t.paidMonths} paid, {t.vacantMonths} vacant and {t.unpaidMonths} unpaid months logged for {year}. Rent
              counts in the year it was received. On the Finnish form: Vuokratulot.
            </Info>
          </span>
          <span className="num">{eur(f.rentIncome)}</span>
        </div>
      </section>

      <section className="section">
        <Heading>Expenses</Heading>
        {f.lines.length === 0 && f.depreciation === 0 && <div className="kv dim">No costs logged for {year}.</div>}
        {f.lines.map((l) => {
          const hint = CATEGORIES[l.category].hint;
          return (
            <div className={'kv' + (l.deductible ? '' : ' faded')} key={l.category}>
              <span>
                {l.label}
                {!l.deductible && (
                  <span className="chip warn" style={{ marginLeft: 6 }}>
                    not deductible
                  </span>
                )}
                <Info about={l.label}>
                  On the Finnish form: {l.fi}.{hint ? ` ${hint}` : ''}
                </Info>
              </span>
              <span className="num">{eur(l.amount)}</span>
            </div>
          );
        })}
        {f.depreciation > 0 && (
          <div className="kv">
            <span>
              Depreciation
              <Info about="depreciation">
                Poisto — a yearly deduction on the building’s remaining cost, set in the apartment settings.
              </Info>
            </span>
            <span className="num">{eur(f.depreciation)}</span>
          </div>
        )}
        <div className="kv sum">
          <span>Deductible total</span>
          <span className="num">{eur(f.deductibleCosts + f.depreciation)}</span>
        </div>
      </section>

      <section>
        <Heading
          info={
            <Info about="the declaration package">
              The zip holds a PDF laid out like the Finnish rental income form (lomake 9 / OmaVero fields) with your
              share of every amount, a CSV ledger and all receipt photos. You file it yourself in OmaVero — this app has
              no connection to Vero.
            </Info>
          }
        >
          Declaration
        </Heading>
        <ErrorNote message={error} />
        <button className="btn primary block" onClick={makePackage} disabled={busy}>
          {Icon.download}
          {busy ? 'Building…' : `Download ${year} declaration (.zip)`}
        </button>
        <button
          className="btn quiet block"
          style={{ marginTop: 8 }}
          onClick={() => download(buildPdf(apt, t, mine, taxpayerName), `vuokratulot-ja-menot-${year}.pdf`)}
        >
          PDF summary only
        </button>
      </section>
    </>
  );
}
