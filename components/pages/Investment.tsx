'use client';

import { useState } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { cashByMonth, investmentSummary, type CashMonth } from '@/lib/domain/investment';
import { eur, pct, round2 } from '@/lib/domain/tax';
import { eurWhole, monthsShort, monthTitle } from '@/lib/ui/format';
import { columnChart, cumulativeChart, inOutChart, type InOutBar, type SegmentKey } from '@/lib/ui/charts';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Info, Money, Segmented } from '@/components/ui';

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

const text = (n: number) => (n ? String(n) : '');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * How each part of the money-in and money-out bars is drawn: rent green, costs
 * yellow, the tax grey, and the loan repayment as a hollow grey, since that
 * money is still the owner's.
 */
const DRAWN: Record<SegmentKey, string> = { rent: 'in', costs: 'out', tax: 'quiet', credit: 'quiet', amortization: 'loan' };

type YearsShown = 'profit' | 'cash';

/**
 * The apartment as the viewer's investment, for a landlord rather than an
 * analyst. It answers, in this order: did the year earn me money, and what
 * did it leave on my account; where the money went and when in the year; how
 * the years compare; what I own. The ratios and the full account since the
 * purchase come last. All of it is the viewer's own part; the loan and the
 * value they enter here are theirs alone, and the loan's interest is not one
 * of them: it is a cost, logged on the Costs page if they want it counted.
 */
export default function Investment({ apt, year, onChanged }: Props) {
  const { t, lang } = useI18n();
  const [shown, setShown] = useState<YearsShown>('cash');
  const [active, setActive] = useState<number | null>(null);
  const s = investmentSummary(apt, year);
  const y = s.year;
  const money = inOutChart(y);
  const months = cashByMonth(apt, year);
  const account = cumulativeChart(months);
  const names = monthsShort(lang);
  const series = s.years.map((r) => (shown === 'cash' ? r.cashFlow : r.profitAfterTax));
  const columns = columnChart(series);
  const loanPoints = [
    ...(s.loanAmount > 0 ? [{ key: 'start', label: t('inv.atPurchase'), value: s.loanAmount }] : []),
    ...apt.myLoanYears.filter((l) => l.year <= year).map((l) => ({ key: String(l.year), label: String(l.year), value: l.balance })),
  ];
  const loanBars = columnChart(loanPoints.map((p) => p.value));
  // What the tax is worked out on, against what the page calls the profit: they part when the tax spreads a cost over years.
  const deferred = round2(y.taxableIncome - y.profitBeforeTax);
  const ratio = (n: number | null) => (n === null ? '—' : pct(n));
  const swatch = (key: SegmentKey) => <i className={'swatch ' + DRAWN[key]} />;

  const bar = (label: string, side: InOutBar) => (
    <div className="io">
      <div className="io-head">
        <span>{label}</span>
        <span className="num">{eur(side.total)}</span>
      </div>
      <div className="io-bar" aria-hidden="true">
        {side.segments.map((seg) => (
          <i key={seg.key} className={DRAWN[seg.key]} style={{ width: `${seg.width}%` }} />
        ))}
      </div>
    </div>
  );

  const shownMonth = active === null ? null : months[active]!;
  /** A month in words: what came in, what went out and what was on the account by its end. */
  const readout = (m: CashMonth) =>
    t('inv.readout', {
      // It opens the sentence, and Swedish and Finnish write month names in lower case.
      month: capitalize(monthTitle(`${year}-${String(m.month).padStart(2, '0')}`, lang)),
      in: eur(m.rentIn),
      out: eur(round2(m.costsOut + m.taxOut + m.amortization)),
      total: eur(m.cumulative),
    });

  return (
    <>
      <section className="hero">
        <div className="duo">
          <div>
            <div className="label">
              {y.profitAfterTax < 0 ? t('inv.heroLoss', { year }) : t('inv.heroProfit', { year })}
              <Info about={t('inv.heroAbout')}>{t('inv.heroInfo')}</Info>
            </div>
            <div className={'big ' + (y.profitAfterTax < 0 ? 'neg' : '')} data-testid="net-profit">
              <Money value={y.profitAfterTax} />
            </div>
          </div>
          <div>
            <div className="label">
              {t('inv.heroCash', { year })}
              <Info about={t('inv.heroCashAbout')}>{t('inv.heroCashInfo')}</Info>
            </div>
            <div className={'big ' + (y.cashFlow < 0 ? 'neg' : '')} data-testid="cash-flow">
              <Money value={y.cashFlow} />
            </div>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{eurWhole(y.rentIncome)}</div>
            <div className="l">{t('common.rent')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(y.runningCosts + y.investments)}</div>
            <div className="l">{t('common.costs')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(y.tax)}</div>
            <div className="l">{t('inv.taxShort')}</div>
          </div>
        </div>
      </section>

      <section className="panel" aria-label={t('inv.cashTitle', { year })}>
        <Heading info={<Info about={t('inv.cashAbout')}>{t('inv.cashInfo')}</Info>}>{t('inv.cashTitle', { year })}</Heading>
        <p className="msg io-says">
          {y.cashFlow < 0 ? t('inv.cashMinus', { amount: eur(-y.cashFlow) }) : t('inv.cashPlus', { amount: eur(y.cashFlow) })}
        </p>
        {bar(t('inv.moneyIn'), money.in)}
        {bar(t('inv.moneyOut'), money.out)}
        <div className="kv">
          <span>
            {swatch('rent')}
            {t('inv.row.rent')}
          </span>
          <span className="num">{eur(y.rentIncome)}</span>
        </div>
        <div className="kv">
          <span>
            {swatch('costs')}
            {t('inv.row.running')}
          </span>
          <span className="num">{eur(-y.runningCosts)}</span>
        </div>
        {y.investments !== 0 && (
          <div className="kv">
            <span>
              {swatch('costs')}
              {t('inv.row.investments')}
            </span>
            <span className="num">{eur(-y.investments)}</span>
          </div>
        )}
        <div className="kv sum">
          <span>{t('inv.row.beforeTax')}</span>
          <span className="num">{eur(y.profitBeforeTax)}</span>
        </div>
        <div className="kv">
          <span>
            {swatch('tax')}
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
          <span>{t('inv.row.afterTax')}</span>
          <span className="num">{eur(y.profitAfterTax)}</span>
        </div>
        <div className="kv">
          <span>
            {swatch('amortization')}
            {t('inv.row.amortization')}
          </span>
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

      {months.length > 0 && (
        <section className="panel" aria-label={t('inv.months', { year })}>
          <Heading info={<Info about={t('inv.monthsAbout')}>{t('inv.monthsInfo')}</Info>}>{t('inv.months', { year })}</Heading>
          <div className="io-head">
            <span>{t('inv.accountSoFar')}</span>
            <span className="num">{eur(months[months.length - 1]!.cumulative)}</span>
          </div>
          <div className="cum">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path className="cum-area" d={account.area} />
              <path className="cum-line" d={account.line} />
            </svg>
            <b className="cum-zero" style={{ top: `${account.zero}%` }} />
            {shownMonth && (
              <>
                <i className="cum-guide" style={{ left: `${account.points[active! + 1]!.x}%` }} />
                <i
                  className="cum-dot"
                  style={{ left: `${account.points[active! + 1]!.x}%`, top: `${account.points[active! + 1]!.y}%` }}
                />
              </>
            )}
            <div className="cum-hits">
              {months.map((m, i) => (
                <button
                  key={m.month}
                  type="button"
                  className="cum-hit"
                  aria-label={readout(m)}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              ))}
            </div>
          </div>
          <ol className="cum-months" aria-hidden="true">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
          <p className="msg cum-readout">
            {shownMonth ? readout(shownMonth) : t('inv.readoutHint')}
          </p>
        </section>
      )}

      {s.years.length > 1 && (
        <section className="panel" aria-label={t('inv.years')}>
          <Heading>{t('inv.years')}</Heading>
          <Segmented<YearsShown>
            label={t('inv.yearsShow')}
            value={shown}
            onChange={setShown}
            options={[
              { value: 'cash', label: t('inv.row.cash') },
              { value: 'profit', label: t('inv.row.afterTax') },
            ]}
          />
          <div className="pc-plot" aria-hidden="true">
            <b className="pc-zero" style={{ bottom: `${columns.zero}%` }} />
            {columns.bars.map((b, i) => (
              <div className="pc-col" key={s.years[i]!.year}>
                <i className={b.down ? 'down' : undefined} style={{ bottom: `${b.bottom}%`, height: `${b.height}%` }} />
              </div>
            ))}
          </div>
          <ol className="pc-labels">
            {s.years.map((r, i) => (
              <li key={r.year} className={r.year === year ? 'now' : undefined}>
                {r.year}
                <b>{eurWhole(series[i]!)}</b>
              </li>
            ))}
          </ol>
          <div className="kv sum years-total">
            <span>{t('inv.yearsTotal', { from: s.years[0]!.year, to: year })}</span>
            <span className="num">{eur(shown === 'cash' ? s.totals.cashFlow : s.totals.profitAfterTax)}</span>
          </div>
        </section>
      )}

      {(s.marketValue !== null || loanPoints.length > 1) && (
        <section className="panel" aria-label={t('inv.own')}>
          <Heading
            info={
              s.marketValue !== null && (
                <Info about={t('inv.ownAbout')}>
                  {t('inv.ownInfo', {
                    value: eur(s.marketValue),
                    equity: eur(s.equityNow!),
                    loan: eur(s.marketValue - s.equityNow!),
                  })}
                </Info>
              )
            }
          >
            {t('inv.own')}
          </Heading>
          {s.marketValue !== null && (
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
                  {t('inv.legend.loan', { amount: eur(s.marketValue - s.equityNow!) })}
                </span>
              </div>
            </>
          )}
          {loanPoints.length > 1 && (
            <div className="loan-years">
              <p className="msg io-says">
                {t('inv.loanSays', { from: eur(loanPoints[0]!.value), to: eur(loanPoints[loanPoints.length - 1]!.value) })}
              </p>
              <div className="pc-plot short" aria-hidden="true">
                {loanBars.bars.map((b, i) => (
                  <div className="pc-col" key={loanPoints[i]!.key}>
                    <i className="quiet" style={{ bottom: `${b.bottom}%`, height: `${b.height}%` }} />
                  </div>
                ))}
              </div>
              <ol className="pc-labels">
                {loanPoints.map((p) => (
                  <li key={p.key}>
                    {p.label}
                    <b>{eurWhole(p.value)}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="panel" aria-label={t('inv.ratios', { year })}>
        <Heading info={<Info about={t('inv.ratiosAbout')}>{t('inv.ratiosInfo')}</Info>}>{t('inv.ratios', { year })}</Heading>
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
