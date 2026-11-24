'use client';

import { useState } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { investmentSummary } from '@/lib/domain/investment';
import { eur, pct } from '@/lib/domain/tax';
import { eurWhole } from '@/lib/ui/format';
import { columnChart, flowChart, type FlowKey } from '@/lib/ui/charts';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Info, Money } from '@/components/ui';

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

const text = (n: number) => (n ? String(n) : '');

/**
 * The apartment as the viewer's investment: the year's profit before and after
 * tax, what was left on their account once the loan was paid down, a few
 * ratios, and everything since they bought it. All of it is the viewer's own
 * part; the loan and the value they enter here are theirs alone, and the
 * loan's interest is not one of them: it is a cost, logged on the Costs page if
 * they want it counted.
 */
export default function Investment({ apt, year, onChanged }: Props) {
  const { t } = useI18n();
  const s = investmentSummary(apt, year);
  const y = s.year;
  const ratio = (n: number | null) => (n === null ? '—' : pct(n));
  const flow = flowChart(y);
  const years = columnChart(s.years);
  const label = (key: FlowKey) =>
    ({
      rent: t('inv.row.rent'),
      running: t('inv.row.running'),
      investments: t('inv.row.investments'),
      beforeTax: t('inv.row.beforeTax'),
      tax: y.tax < 0 ? t('inv.row.credit') : t('inv.row.tax'),
      afterTax: t('inv.row.afterTax'),
      amortization: t('inv.row.amortization'),
      cash: t('inv.row.cash'),
    })[key];

  return (
    <>
      <section className="hero">
        <div className="label">
          {y.profitAfterTax < 0 ? t('inv.heroLoss', { year }) : t('inv.heroProfit', { year })}
          <Info about={t('inv.heroAbout')}>{t('inv.heroInfo')}</Info>
        </div>
        <div className={'big ' + (y.profitAfterTax < 0 ? 'neg' : '')} data-testid="net-profit">
          <Money value={y.profitAfterTax} />
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{eurWhole(y.profitBeforeTax)}</div>
            <div className="l">{t('inv.beforeTax')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(y.tax)}</div>
            <div className="l">{t('inv.taxShort')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(y.cashFlow)}</div>
            <div className="l">{t('inv.leftShort')}</div>
          </div>
        </div>
      </section>

      <section className="panel" aria-label={t('inv.flow', { year })}>
        <Heading info={<Info about={t('inv.flowAbout')}>{t('inv.flowInfo')}</Info>}>{t('inv.flow', { year })}</Heading>
        <ol className="flow">
          {flow.steps.map((step) => (
            <li key={step.key} className={'flow-row' + (step.kind === 'total' ? ' total' : '')}>
              <div className="flow-head">
                <span>{label(step.key)}</span>
                <span className="num">{eur(step.value)}</span>
              </div>
              <div className="flow-track" aria-hidden="true">
                <b className="flow-zero" style={{ left: `${flow.zero}%` }} />
                <i className={'flow-bar ' + step.kind} style={{ left: `${step.left}%`, width: `${step.width}%` }} />
              </div>
            </li>
          ))}
        </ol>
        {y.loanBalance !== null && (
          <div className="kv faded">
            <span>{t('inv.row.balance', { year })}</span>
            <span className="num">{eur(y.loanBalance)}</span>
          </div>
        )}
      </section>

      <section className="panel" aria-label={t('inv.ratios', { year })}>
        <Heading>{t('inv.ratios', { year })}</Heading>
        <div className="stats two insights">
          <div className="stat">
            <div className="v">{ratio(s.ratios.grossYield)}</div>
            <div className="l">
              {t('inv.grossYield')}
              <Info about={t('inv.grossYield')}>{t('inv.grossYieldInfo')}</Info>
            </div>
          </div>
          <div className="stat">
            <div className="v">{ratio(s.ratios.returnBeforeTax)}</div>
            <div className="l">
              {t('inv.returnBeforeTax')}
              <Info about={t('inv.returnBeforeTax')}>{t('inv.returnBeforeTaxInfo')}</Info>
            </div>
          </div>
          <div className="stat">
            <div className="v">{ratio(s.ratios.returnOnEquity)}</div>
            <div className="l">
              {t('inv.returnOnEquity')}
              <Info about={t('inv.returnOnEquity')}>{t('inv.returnOnEquityInfo')}</Info>
            </div>
          </div>
          <div className="stat">
            <div className="v">{ratio(s.ratios.loanToValue)}</div>
            <div className="l">
              {t('inv.loanToValue')}
              <Info about={t('inv.loanToValue')}>{t('inv.loanToValueInfo')}</Info>
            </div>
          </div>
        </div>
      </section>

      <section className="panel" aria-label={t('inv.since')}>
        <Heading info={<Info about={t('inv.sinceAbout')}>{t('inv.sinceInfo', { year })}</Info>}>{t('inv.since')}</Heading>
        <div className="kv">
          <span>{t('inv.row.invested')}</span>
          <span className="num">{eur(s.invested)}</span>
        </div>
        {s.loanAmount > 0 && (
          <>
            <div className="kv">
              <span>{t('inv.row.loanAmount')}</span>
              <span className="num">{eur(-s.loanAmount)}</span>
            </div>
            <div className="kv sum">
              <span>{t('inv.row.equityInvested')}</span>
              <span className="num">{eur(s.equityInvested)}</span>
            </div>
          </>
        )}
        <div className="kv">
          <span>{t('inv.row.profitTotal')}</span>
          <span className="num">{eur(s.totals.profitAfterTax)}</span>
        </div>
        <div className="kv">
          <span>{t('inv.row.amortizationTotal')}</span>
          <span className="num">{eur(s.totals.amortization)}</span>
        </div>
        <div className="kv">
          <span>{t('inv.row.cashTotal')}</span>
          <span className="num">{eur(s.totals.cashFlow)}</span>
        </div>
        {s.marketValue === null ? (
          <p className="msg" style={{ margin: '12px 0 4px' }}>
            {t('inv.noValue')}
          </p>
        ) : (
          <>
            <div className="equity" aria-hidden="true">
              <i className="quiet" style={{ width: `${Math.min(100, s.ratios.loanToValue!)}%` }} />
              <i className="net" />
            </div>
            <div className="legend">
              <span>
                <i className="quiet" />
                {t('inv.legend.loan', { amount: eur(s.marketValue - s.equityNow!) })}
              </span>
              <span>
                <i className="net" />
                {t('inv.legend.equity', { amount: eur(s.equityNow!) })}
              </span>
            </div>
            <div className="kv">
              <span>{t('inv.row.marketValue')}</span>
              <span className="num">{eur(s.marketValue)}</span>
            </div>
            <div className="kv">
              <span>{t('inv.row.valueChange')}</span>
              <span className="num">{eur(s.valueChange!)}</span>
            </div>
            <div className="kv">
              <span>{t('inv.row.equityNow')}</span>
              <span className="num">{eur(s.equityNow!)}</span>
            </div>
            <div className="kv sum">
              <span>
                {t('inv.row.totalReturn')}
                <Info about={t('inv.row.totalReturn')}>{t('inv.totalReturnInfo')}</Info>
              </span>
              <span className="num">{eur(s.totalReturn!)}</span>
            </div>
          </>
        )}
      </section>

      {s.years.length > 0 && (
        <section className="panel" aria-label={t('inv.byYear')}>
          <Heading>{t('inv.byYear')}</Heading>
          <div className="years-chart" aria-hidden="true">
            <div className="yc-plot">
              <b className="yc-zero" style={{ bottom: `${years.zero}%` }} />
              {years.columns.map((c, i) => (
                <div
                  className="yc-col"
                  key={c.year}
                  title={t('inv.columnTitle', {
                    year: c.year,
                    profit: eur(s.years[i]!.profitAfterTax),
                    cash: eur(s.years[i]!.cashFlow),
                  })}
                >
                  <i className={'net' + (c.profit.down ? ' down' : '')} style={{ bottom: `${c.profit.bottom}%`, height: `${c.profit.height}%` }} />
                  <i className={'quiet' + (c.cash.down ? ' down' : '')} style={{ bottom: `${c.cash.bottom}%`, height: `${c.cash.height}%` }} />
                </div>
              ))}
            </div>
            <div className="yc-labels">
              {years.columns.map((c) => (
                <span key={c.year}>{c.year}</span>
              ))}
            </div>
          </div>
          <div className="legend">
            <span>
              <i className="net" />
              {t('inv.row.afterTax')}
            </span>
            <span>
              <i className="quiet" />
              {t('inv.row.cash')}
            </span>
          </div>
          <ul className="list">
            {[...s.years].reverse().map((r) => (
              <li className="row" key={r.year}>
                <div className="main">
                  <div className="t">{r.year}</div>
                  <div className="s">{t('inv.yearCash', { amount: eur(r.cashFlow) })}</div>
                </div>
                <div className="strong num">{eur(r.profitAfterTax)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LoanForm key={year} apt={apt} year={year} onChanged={onChanged} />
    </>
  );
}

/** The viewer's own loan and estimated value, and the year's figures from the bank's statement: saved with one button. */
function LoanForm({ apt, year, onChanged }: Props) {
  const { t } = useI18n();
  const keptDetails = apt.myInvestment ?? { loanAmount: 0, marketValue: 0 };
  const keptYear = apt.myLoanYears.find((l) => l.year === year) ?? { amortization: 0, balance: 0 };
  const [loanAmount, setLoanAmount] = useState(text(keptDetails.loanAmount));
  const [marketValue, setMarketValue] = useState(text(keptDetails.marketValue));
  const [amortization, setAmortization] = useState(text(keptYear.amortization));
  const [balance, setBalance] = useState(text(keptYear.balance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const details = { loanAmount: Number(loanAmount), marketValue: Number(marketValue) };
  const loan = { amortization: Number(amortization), balance: Number(balance) };
  const detailsSaved = details.loanAmount === keptDetails.loanAmount && details.marketValue === keptDetails.marketValue;
  const yearSaved = loan.amortization === keptYear.amortization && loan.balance === keptYear.balance;
  const anythingKept = apt.myInvestment !== null || apt.myLoanYears.some((l) => l.year === year);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (!detailsSaved) await api.saveInvestment(apt.id, details);
      if (!yearSaved) await api.saveLoanYear(apt.id, year, loan);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const field = (id: string, value: string, set: (v: string) => void) => (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => set(e.target.value)}
    />
  );

  return (
    <section className="panel" aria-label={t('inv.details')}>
      <Heading
        info={<Info about={t('inv.detailsAbout')}>{t('inv.detailsInfo')}</Info>}
        action={detailsSaved && yearSaved && anythingKept ? <span className="chip">{t('sale.saved')}</span> : undefined}
      >
        {t('inv.details')}
      </Heading>
      <div className="cols">
        <div>
          <label htmlFor="inv-loan">{t('inv.loanAmount')}</label>
          {field('inv-loan', loanAmount, setLoanAmount)}
        </div>
        <div>
          <label htmlFor="inv-value">{t('inv.marketValue')}</label>
          {field('inv-value', marketValue, setMarketValue)}
        </div>
      </div>
      <div className="cols">
        <div>
          <label htmlFor="inv-amortization">{t('inv.amortization', { year })}</label>
          {field('inv-amortization', amortization, setAmortization)}
        </div>
        <div>
          <label htmlFor="inv-balance">{t('inv.balance', { year })}</label>
          {field('inv-balance', balance, setBalance)}
        </div>
      </div>
      <ErrorNote message={error} />
      <div className="form-foot">
        <button className="btn primary small" disabled={busy || (detailsSaved && yearSaved)} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </section>
  );
}
