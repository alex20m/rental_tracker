'use client';

import { useState } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { investmentSummary } from '@/lib/domain/investment';
import { eur, pct } from '@/lib/domain/tax';
import { eurWhole } from '@/lib/ui/format';
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

      <section className="panel" aria-label={t('inv.result', { year })}>
        <Heading info={<Info about={t('inv.resultAbout')}>{t('inv.resultInfo')}</Info>}>{t('inv.result', { year })}</Heading>
        <div className="kv">
          <span>{t('inv.row.rent')}</span>
          <span className="num">{eur(y.rentIncome)}</span>
        </div>
        <div className="kv">
          <span>{t('inv.row.running')}</span>
          <span className="num">{eur(-y.runningCosts)}</span>
        </div>
        {y.investments !== 0 && (
          <div className="kv">
            <span>{t('inv.row.investments')}</span>
            <span className="num">{eur(-y.investments)}</span>
          </div>
        )}
        <div className="kv sum">
          <span>{t('inv.row.beforeTax')}</span>
          <span className="num">{eur(y.profitBeforeTax)}</span>
        </div>
        <div className="kv">
          <span>{y.tax < 0 ? t('inv.row.credit') : t('inv.row.tax')}</span>
          <span className="num">{eur(-y.tax)}</span>
        </div>
        <div className="kv sum">
          <span>{t('inv.row.afterTax')}</span>
          <span className="num">{eur(y.profitAfterTax)}</span>
        </div>
      </section>

      <section className="panel" aria-label={t('inv.cash', { year })}>
        <Heading info={<Info about={t('inv.cashAbout')}>{t('inv.cashInfo')}</Info>}>{t('inv.cash', { year })}</Heading>
        <div className="kv">
          <span>{t('inv.row.afterTax')}</span>
          <span className="num">{eur(y.profitAfterTax)}</span>
        </div>
        <div className="kv">
          <span>{t('inv.row.amortization')}</span>
          <span className="num">{eur(-y.amortization)}</span>
        </div>
        <div className="kv sum">
          <span>{t('inv.row.cash')}</span>
          <span className="num">{eur(y.cashFlow)}</span>
        </div>
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
