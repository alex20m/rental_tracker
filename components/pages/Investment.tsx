'use client';

import { useState, type ReactNode } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { cashByMonth, costsByCategory, investmentSummary, type CashMonth } from '@/lib/domain/investment';
import { eur, pct, round2 } from '@/lib/domain/tax';
import { eurWhole, monthsShort, monthTitle } from '@/lib/ui/format';
import { columnChart, shareOfLargest } from '@/lib/ui/charts';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Info, Money } from '@/components/ui';

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

const text = (n: number) => (n ? String(n) : '');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The apartment as the viewer's investment, laid out the way rental
 * investment dashboards are: the key figures first (cash flow and profit,
 * then rent, costs, net operating income, yields and occupancy), then the
 * year's money month by month, the income statement, the costs by kind, the
 * cash flow by year and the value against the loan; the full account since
 * the purchase and the form come last. Every explanation is behind an "i".
 * All of it is the viewer's own part; the loan and the value they enter here
 * are theirs alone, and the loan's interest is a cost, logged on the Costs page
 * if they want it counted.
 */
export default function Investment({ apt, year, onChanged }: Props) {
  const { t, lang } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const s = investmentSummary(apt, year);
  const y = s.year;
  const costs = round2(y.runningCosts + y.investments);
  const months = cashByMonth(apt, year);
  const monthBars = shareOfLargest(months.flatMap((m) => [m.rentIn, m.costsOut]));
  const kinds = costsByCategory(apt, year);
  const kindBars = shareOfLargest(kinds.map((k) => k.amount));
  const cashYears = columnChart(s.years.map((r) => r.cashFlow));
  const names = monthsShort(lang);
  // What the tax is worked out on, against the profit: they part when the tax spreads a cost over years.
  const deferred = round2(y.taxableIncome - y.profitBeforeTax);
  const ratio = (n: number | null) => (n === null ? '—' : pct(n));

  /** A key figure: its name with its explanation behind an "i", and its value. */
  const kpi = (label: string, info: string, value: ReactNode) => (
    <div className="kpi" key={label}>
      <div className="l">
        {label}
        <Info about={label}>{info}</Info>
      </div>
      <div className="v num">{value}</div>
    </div>
  );

  /** A month in words: its rent and its costs. */
  const monthSays = (m: CashMonth) =>
    t('inv.monthSays', {
      // It opens the sentence, and Swedish and Finnish write month names in lower case.
      month: capitalize(monthTitle(`${year}-${String(m.month).padStart(2, '0')}`, lang)),
      rent: eur(m.rentIn),
      costs: eur(m.costsOut),
    });

  return (
    <>
      <section className="hero">
        <div className="duo">
          <div>
            <div className="label">
              {t('inv.kpi.cash')}
              <Info about={t('inv.kpi.cash')}>{t('inv.kpi.cashInfo')}</Info>
            </div>
            <div className={'big ' + (y.cashFlow < 0 ? 'neg' : '')} data-testid="cash-flow">
              <Money value={y.cashFlow} />
            </div>
          </div>
          <div>
            <div className="label">
              {t('inv.kpi.profit')}
              <Info about={t('inv.kpi.profit')}>{t('inv.kpi.profitInfo')}</Info>
            </div>
            <div className={'big ' + (y.profitAfterTax < 0 ? 'neg' : '')} data-testid="net-profit">
              <Money value={y.profitAfterTax} />
            </div>
          </div>
        </div>
        <div className="kpis">
          {/* Gross and net yield first and side by side, two or three across alike. */}
          {kpi(t('inv.kpi.gross'), t('inv.kpi.grossInfo'), ratio(s.ratios.grossYield))}
          {kpi(t('inv.kpi.net'), t('inv.kpi.netInfo'), ratio(s.ratios.netYield))}
          {kpi(t('inv.kpi.occupancy'), t('inv.kpi.occupancyInfo'), y.occupancy === null ? '—' : `${y.occupancy} %`)}
          {kpi(t('inv.kpi.rent'), t('inv.kpi.rentInfo'), eurWhole(y.rentIncome))}
          {kpi(t('inv.kpi.costs'), t('inv.kpi.costsInfo'), eurWhole(costs))}
          {kpi(t('inv.kpi.noi'), t('inv.kpi.noiInfo'), eurWhole(y.netOperatingIncome))}
        </div>
      </section>

      {months.length > 0 && (
        <section className="panel" aria-label={t('inv.monthly', { year })}>
          <Heading info={<Info about={t('inv.monthlyAbout')}>{t('inv.monthlyInfo')}</Info>}>{t('inv.monthly', { year })}</Heading>
          <div className="mc">
            {months.map((m, i) => (
              <button
                key={m.month}
                type="button"
                className={'mc-month' + (active === i ? ' on' : '')}
                aria-label={monthSays(m)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <span className="mc-bars" aria-hidden="true">
                  <i className="in" style={{ height: `${monthBars[2 * i]}%` }} />
                  <i className="out" style={{ height: `${monthBars[2 * i + 1]}%` }} />
                </span>
                <span className="mc-name" aria-hidden="true">
                  {names[m.month - 1]}
                </span>
              </button>
            ))}
          </div>
          <div className="legend">
            <span>
              <i />
              {t('inv.kpi.rent')}
            </span>
            <span>
              <i className="cost" />
              {t('inv.kpi.costs')}
            </span>
          </div>
          <p className="msg mc-readout">
            {active === null
              ? t('inv.yearSays', { year, rent: eur(y.rentIncome), costs: eur(costs) })
              : monthSays(months[active]!)}
          </p>
        </section>
      )}

      <section className="panel" aria-label={t('inv.statement', { year })}>
        <Heading info={<Info about={t('inv.statementAbout')}>{t('inv.statementInfo')}</Info>}>
          {t('inv.statement', { year })}
        </Heading>
        <div className="kv">
          <span>{t('inv.kpi.rent')}</span>
          <span className="num">{eur(y.rentIncome)}</span>
        </div>
        <div className="kv">
          <span>{t('inv.row.operating')}</span>
          <span className="num">{eur(-y.operatingCosts)}</span>
        </div>
        <div className="kv sum">
          <span>{t('inv.kpi.noi')}</span>
          <span className="num">{eur(y.netOperatingIncome)}</span>
        </div>
        {y.financingCosts !== 0 && (
          <div className="kv">
            <span>{t('inv.row.financing')}</span>
            <span className="num">{eur(-y.financingCosts)}</span>
          </div>
        )}
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
          <span>
            {y.tax < 0 ? t('inv.row.credit') : t('inv.row.tax')}
            {deferred !== 0 && (
              <Info about={t('inv.taxWhyAbout')}>
                {deferred > 0
                  ? t('inv.taxLater', { taxable: eur(y.taxableIncome), amount: eur(deferred) })
                  : t('inv.taxEarlier', { taxable: eur(y.taxableIncome), amount: eur(-deferred) })}
              </Info>
            )}
          </span>
          <span className="num">{eur(-y.tax)}</span>
        </div>
        <div className="kv sum">
          <span>{t('inv.kpi.profit')}</span>
          <span className="num">{eur(y.profitAfterTax)}</span>
        </div>
        <div className="kv">
          <span>
            {t('inv.row.amortization')}
            <Info about={t('inv.row.amortization')}>{t('inv.row.amortizationInfo')}</Info>
          </span>
          <span className="num">{eur(-y.amortization)}</span>
        </div>
        <div className="kv sum">
          <span>{t('inv.kpi.cash')}</span>
          <span className="num">{eur(y.cashFlow)}</span>
        </div>
        {y.loanBalance !== null && (
          <div className="kv faded">
            <span>{t('inv.row.balance', { year })}</span>
            <span className="num">{eur(y.loanBalance)}</span>
          </div>
        )}
      </section>

      <section className="panel" aria-label={t('inv.kinds', { year })}>
        <Heading>{t('inv.kinds', { year })}</Heading>
        {kinds.length === 0 ? (
          <p className="msg">{t('inv.kindsNone')}</p>
        ) : (
          <ul className="kinds">
            {kinds.map((k, i) => (
              <li key={k.category}>
                <div className="kind-head">
                  <span>{t(`cat.${k.category}.label`)}</span>
                  <span className="num">{eur(k.amount)}</span>
                </div>
                <span className="kind-bar" aria-hidden="true">
                  <i style={{ width: `${kindBars[i]}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.years.length > 1 && (
        <section className="panel" aria-label={t('inv.years')}>
          <Heading info={<Info about={t('inv.years')}>{t('inv.yearsInfo')}</Info>}>{t('inv.years')}</Heading>
          <div className="pc-plot" aria-hidden="true">
            <b className="pc-zero" style={{ bottom: `${cashYears.zero}%` }} />
            {cashYears.bars.map((b, i) => (
              <div className="pc-col" key={s.years[i]!.year}>
                <i className={b.down ? 'down' : undefined} style={{ bottom: `${b.bottom}%`, height: `${b.height}%` }} />
              </div>
            ))}
          </div>
          <ol className="pc-labels">
            {s.years.map((r) => (
              <li key={r.year} className={r.year === year ? 'now' : undefined}>
                {r.year}
                <b>{eurWhole(r.cashFlow)}</b>
              </li>
            ))}
          </ol>
          <div className="kv sum years-total">
            <span>{t('inv.yearsTotal', { from: s.years[0]!.year, to: year })}</span>
            <span className="num">{eur(s.totals.cashFlow)}</span>
          </div>
        </section>
      )}

      <section className="panel" aria-label={t('inv.value')}>
        <Heading info={<Info about={t('inv.value')}>{t('inv.valueInfo')}</Info>}>{t('inv.value')}</Heading>
        {s.marketValue === null ? (
          <p className="msg">{t('inv.valueNone')}</p>
        ) : (
          <>
            <div className="equity" aria-hidden="true">
              <i className="net" />
              <i className="quiet" style={{ width: `${Math.min(100, s.ratios.loanToValue!)}%` }} />
            </div>
            <div className="legend">
              <span>
                <i className="net" />
                {t('inv.legend.equity', { amount: eur(s.equityNow!) })}
              </span>
              <span>
                <i className="quiet" />
                {t('inv.legend.loan', { amount: eur(s.loanNow) })}
              </span>
            </div>
          </>
        )}
        <div className="kpis in-panel">
          {kpi(t('inv.kpi.value'), t('inv.kpi.valueInfo'), s.marketValue === null ? '—' : eurWhole(s.marketValue))}
          {kpi(t('inv.kpi.loan'), t('inv.kpi.loanInfo'), s.loanNow > 0 ? eurWhole(s.loanNow) : '—')}
          {kpi(t('inv.kpi.ltv'), t('inv.kpi.ltvInfo'), ratio(s.ratios.loanToValue))}
          {kpi(t('inv.kpi.coc'), t('inv.kpi.cocInfo'), ratio(s.ratios.cashOnCash))}
        </div>
      </section>

      <section className="panel" aria-label={t('inv.since')}>
        <Heading info={<Info about={t('inv.since')}>{t('inv.sinceInfo', { year })}</Info>}>{t('inv.since')}</Heading>
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
        {s.marketValue !== null && (
          <>
            <div className="kv">
              <span>{t('inv.row.valueChange')}</span>
              <span className="num">{eur(s.valueChange!)}</span>
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
