'use client';

import { computeTax, eur, ownerShare, pct, portfolioTotals } from '@/lib/domain/tax';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import type { Account } from '@/components/RentalApp';
import { VerifyNotice } from '@/components/Notices';
import { eurWhole } from '@/lib/ui/format';
import { useI18n } from '@/components/I18nProvider';
import { Heading, Icon, Info, Money } from '@/components/ui';

type Props = {
  items: PortfolioItem[];
  details: Record<string, ApartmentView>;
  year: number;
  account: Account;
  onOpen: (id: string) => void;
};

/** Your share of every apartment, added together — what your own tax return sees. */
export default function Portfolio({ items, details, year, account, onOpen }: Props) {
  const { t } = useI18n();
  const shares = items.flatMap((i) => {
    const d = details[i.id];
    return d ? [{ item: i, share: ownerShare(computeTax(d, year), d.mySharePct) }] : [];
  });
  const total = portfolioTotals(shares.map((s) => s.share));

  return (
    <>
      <VerifyNotice account={account} />

      <section className="hero">
        <div className="label">
          {t('portfolio.net', { year })}
          <Info about={t('home.netAbout')}>{t('portfolio.netInfo')}</Info>
        </div>
        <div className={'big ' + (total.netIncome < 0 ? 'neg' : '')} data-testid="net-income">
          <Money value={total.netIncome} />
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{eurWhole(total.rentIncome)}</div>
            <div className="l">{t('common.rent')}</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(total.deductibleCosts + total.depreciation)}</div>
            <div className="l">
              {t('home.deductions')}
              <Info about={t('home.deductionsAbout')}>{t('portfolio.deductionsInfo')}</Info>
            </div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(total.estimatedTax)}</div>
            <div className="l">
              {t('home.estTax')}
              <Info about={t('home.estTaxAbout')}>{t('portfolio.estTaxInfo')}</Info>
            </div>
          </div>
        </div>
      </section>

      <section>
        <Heading>{t('portfolio.apartments')}</Heading>
        <ul className="list">
          {items.map((i) => {
            const s = shares.find((x) => x.item.id === i.id)?.share;
            return (
              <li key={i.id}>
                <button className="row-btn" onClick={() => onOpen(i.id)}>
                  {Icon.building}
                  <div className="main">
                    <div className="t">{i.name}</div>
                    <div className="s">
                      {i.mySharePct === 100 ? t('common.yours') : t('portfolio.youOwn', { pct: pct(i.mySharePct) })}
                      {i.ownerCount > 1 ? t('portfolio.owners', { n: i.ownerCount }) : ''}
                    </div>
                  </div>
                  {s && (
                    <div className={'strong num ' + (s.netIncome < 0 ? 'neg' : '')} title={t('portfolio.netTitle', { year })}>
                      {eur(s.netIncome)}
                    </div>
                  )}
                  {Icon.right}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
