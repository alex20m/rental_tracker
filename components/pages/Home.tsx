'use client';

import type { ApartmentView } from '@/lib/domain/types';
import { computeTax, deductionOf, deductionsOf, eur, ownerShare } from '@/lib/domain/tax';
import { buildChecklist } from '@/lib/domain/checklist';
import { eurWhole, monthsShort, monthTitle, shortDate } from '@/lib/ui/format';
import { ruleParams } from '@/lib/ui/ruleParams';
import { useI18n } from '@/components/I18nProvider';
import type { Account, Go, Scope } from '@/components/RentalApp';
import ScopeToggle from '@/components/ScopeToggle';
import { VerifyNotice } from '@/components/Notices';
import { Heading, Icon, Info, Money } from '@/components/ui';

/** Home is a glance, not a report: a few items, with the rest one tap away. */
const TODO_SHOWN = 3;
const RECENT_SHOWN = 3;

type Props = {
  apt: ApartmentView;
  year: number;
  account: Account;
  scope: Scope;
  onScope: (s: Scope) => void;
  go: Go;
};

export default function Home({ apt, year, account, scope, onScope, go }: Props) {
  const i18n = useI18n();
  const { t, lang } = i18n;
  const tax = computeTax(apt, year);
  const mine = ownerShare(tax, apt.mySharePct);
  const shared = apt.mySharePct !== 100;
  const f = shared && scope === 'whole' ? tax : mine;
  const y = String(year);

  const todo = buildChecklist({ apt, tax }, i18n).filter((i) => !i.ok);
  const hasData = apt.rents.some((r) => r.month.startsWith(y)) || apt.costs.some((c) => c.date.startsWith(y));

  const rentByMonth = Array(12).fill(0) as number[];
  const costByMonth = Array(12).fill(0) as number[];
  apt.rents.forEach((r) => {
    if (r.status === 'paid' && r.receivedDate.startsWith(y))
      rentByMonth[Number(r.receivedDate.slice(5, 7)) - 1]! += r.amount;
  });
  apt.costs.forEach((c) => {
    if (c.date.startsWith(y) && deductionOf(c, apt.settings) !== 'none')
      costByMonth[Number(c.date.slice(5, 7)) - 1]! += c.amount;
  });
  const max = Math.max(1, ...rentByMonth, ...costByMonth);
  const now = new Date();
  const currentMonth = now.getFullYear() === year ? now.getMonth() : -1;

  const loggedMonths = tax.paidMonths + tax.vacantMonths + tax.unpaidMonths;
  const occupancy = loggedMonths ? Math.round((tax.paidMonths / loggedMonths) * 100) : null;
  const price = apt.settings.purchasePrice;
  const grossYield = price > 0 ? (tax.rentIncome / price) * 100 : null;
  const netYield = price > 0 ? ((tax.rentIncome - tax.deductibleCosts) / price) * 100 : null;

  const recent = [
    ...apt.rents.map((r) => ({
      key: 'r' + r.month,
      to: 'rent' as const,
      date: r.receivedDate || r.month + '-01',
      title: t(
        r.status === 'paid' ? 'home.recentRent' : r.status === 'vacant' ? 'home.recentVacant' : 'home.recentUnpaid',
        {
          month: monthTitle(r.month, lang),
        },
      ),
      amt: r.amount,
      // Vacant and unpaid months bring in nothing: show a dash, not "+0,00 €".
      sign: r.status === 'paid' ? 1 : 0,
    })),
    ...apt.costs.map((c) => ({
      key: 'c' + c.id,
      to: 'costs' as const,
      date: c.date,
      title: c.description || t(`cat.${c.category}.label`),
      amt: c.amount,
      sign: -1,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_SHOWN);

  return (
    <>
      <VerifyNotice account={account} />

      <section className="hero">
        {shared && <ScopeToggle sharePct={apt.mySharePct} scope={scope} onScope={onScope} />}
        <div className="label" style={{ marginTop: shared ? 10 : 0 }}>
          {f.netIncome < 0 ? t('home.rentalLoss') : t('home.netIncome')} · {year}
          <Info about={t('home.netAbout')}>{t('home.netInfo')}</Info>
        </div>
        <div className={'big ' + (f.netIncome < 0 ? 'neg' : '')} data-testid="net-income">
          <Money value={f.netIncome} />
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{eurWhole(f.rentIncome)}</div>
            <div className="l">{t('common.rent')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(deductionsOf(f))}</div>
            <div className="l">{t('home.deductions')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(f.estimatedTax)}</div>
            <div className="l">
              {t('home.estTax')}
              <Info about={t('home.estTaxAbout')}>
                {t('home.estTaxInfo', {
                  ...ruleParams(year, lang),
                  onYourShare: shared && scope === 'mine' ? t('home.onYourShare') : '',
                })}
              </Info>
            </div>
          </div>
        </div>
      </section>

      {todo.length > 0 ? (
        <section>
          <Heading>{t('home.todo')}</Heading>
          <div className="card todo">
            {todo.slice(0, TODO_SHOWN).map((i) => (
              <button key={i.id} className="row-btn" onClick={() => go(i.to)}>
                <span className="dot">{Icon.alert}</span>
                <span className="main">{i.text}</span>
                {Icon.right}
              </button>
            ))}
            {todo.length > TODO_SHOWN && (
              <button className="row-btn" onClick={() => go('tax')}>
                <span className="main dim">{t('home.moreTodo', { n: todo.length - TODO_SHOWN })}</span>
                {Icon.right}
              </button>
            )}
          </div>
        </section>
      ) : (
        hasData && (
          <section className="card ready">
            <div className="allset">
              {Icon.check} {t('home.allSet', { year })}
            </div>
            <button className="btn primary block" onClick={() => go('tax')}>
              {t('home.prepare', { year })}
            </button>
          </section>
        )
      )}

      {hasData && (
        <>
          <section>
            <Heading>{t('home.byMonth')}</Heading>
            <div
              className="bars"
              role="img"
              aria-label={t('home.chartLabel', {
                rent: eur(rentByMonth.reduce((a, b) => a + b, 0)),
                costs: eur(costByMonth.reduce((a, b) => a + b, 0)),
                year,
              })}
            >
              {monthsShort(lang).map((m, i) => (
                <div className={'col' + (i === currentMonth ? ' now' : '')} key={m}>
                  <div className="pair">
                    <div
                      className="bar"
                      style={{ height: `${(rentByMonth[i]! / max) * 100}%` }}
                      title={t('home.barRent', {
                        month: m,
                        amount: eur(rentByMonth[i]!),
                      })}
                    />
                    <div
                      className="bar cost"
                      style={{ height: `${(costByMonth[i]! / max) * 100}%` }}
                      title={t('home.barCosts', {
                        month: m,
                        amount: eur(costByMonth[i]!),
                      })}
                    />
                  </div>
                  <div className="lbl">{m[0]}</div>
                </div>
              ))}
            </div>
            <div className="legend">
              <span>
                <i />
                {t('common.rent')}
              </span>
              <span>
                <i className="cost" />
                {t('common.costs')}
              </span>
            </div>
          </section>

          <section className="stats two card insights">
            <div className="stat">
              <div className="v">{occupancy === null ? '—' : occupancy + ' %'}</div>
              <div className="l">
                {t('home.occupancy')}
                <Info about={t('home.occupancyAbout')}>
                  {t('home.occupancyInfo', {
                    paid: tax.paidMonths,
                    vacant: tax.vacantMonths,
                    unpaid: tax.unpaidMonths ? t('home.occupancyUnpaid', { n: tax.unpaidMonths }) : '',
                  })}
                </Info>
              </div>
            </div>
            <div className="stat">
              <div className="v">{grossYield === null ? '—' : grossYield.toFixed(1) + ' %'}</div>
              <div className="l">
                {t('home.yield')}
                <Info about={t('home.yieldAbout')}>
                  {t('home.yieldInfo', {
                    net: netYield !== null ? t('home.yieldNet', { n: netYield.toFixed(1) }) : '',
                    addPrice: price <= 0 ? t('home.yieldAddPrice') : '',
                  })}
                </Info>
              </div>
            </div>
          </section>
        </>
      )}

      <section>
        <Heading>{t('home.recent')}</Heading>
        {recent.length === 0 ? (
          <div className="empty">
            {t('home.nothingYet')}
            <button className="btn primary" onClick={() => go('rent')}>
              {t('home.logFirstRent')}
            </button>
          </div>
        ) : (
          <ul className="list card">
            {recent.map((r) => (
              <li key={r.key}>
                <button className="row-btn" onClick={() => go(r.to)}>
                  <div className="main">
                    <div className="t">{r.title}</div>
                    <div className="s">{shortDate(r.date, lang)}</div>
                  </div>
                  {r.sign === 0 ? (
                    <div className="dim">—</div>
                  ) : (
                    <div className={'strong num ' + (r.sign > 0 ? 'pos' : '')}>
                      {r.sign > 0 ? '+' : '−'}
                      {eur(r.amt)}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
