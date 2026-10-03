'use client';

import { computeTax, eur, ownerShare, pct, portfolioTotals } from '@/lib/domain/tax';
import type { ApartmentView, PortfolioItem } from '@/lib/domain/types';
import type { Account } from '@/components/RentalApp';
import { VerifyNotice } from '@/components/Notices';
import { eurWhole } from '@/lib/ui/format';
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
          Your net income, all apartments · {year}
          <Info about="net income">
            Your share of the rent received, minus your share of deductible costs and depreciation, added across all
            your apartments.
          </Info>
        </div>
        <div className={'big ' + (total.netIncome < 0 ? 'neg' : '')} data-testid="net-income">
          <Money value={total.netIncome} />
        </div>
        <div className="stats">
          <div className="stat">
            <div className="v">{eurWhole(total.rentIncome)}</div>
            <div className="l">Rent</div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(total.deductibleCosts + total.depreciation)}</div>
            <div className="l">
              Deductions
              <Info about="deductions">Deductible costs plus depreciation.</Info>
            </div>
          </div>
          <div className="stat">
            <div className="v">{eurWhole(total.estimatedTax)}</div>
            <div className="l">
              Est. tax
              <Info about="the tax estimate">
                30 % up to €30 000 of capital income, 34 % above — estimated on all your apartments together, because
                the rate depends on the total. Other capital income isn’t included.
              </Info>
            </div>
          </div>
        </div>
      </section>

      <section>
        <Heading>Apartments</Heading>
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
                      {i.mySharePct === 100 ? 'Yours' : `You own ${pct(i.mySharePct)}`}
                      {i.ownerCount > 1 ? ` · ${i.ownerCount} owners` : ''}
                    </div>
                  </div>
                  {s && (
                    <div className={'strong num ' + (s.netIncome < 0 ? 'neg' : '')} title={`Your net income ${year}`}>
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
