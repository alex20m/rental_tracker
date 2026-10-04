'use client';

import type { ApartmentView } from '@/lib/domain/types';
import { computeTax, deductionsOf, eur, ownerShare } from '@/lib/domain/tax';
import { eurWhole } from '@/lib/ui/format';
import { useI18n } from '@/components/I18nProvider';
import type { Scope } from '@/components/RentalApp';
import ScopeToggle from '@/components/ScopeToggle';
import { Heading, Icon, Info, Money } from '@/components/ui';

type Props = {
  apt: ApartmentView;
  thisYear: number;
  scope: Scope;
  onScope: (s: Scope) => void;
  /** Open one year's tax summary. */
  onPick: (year: number) => void;
};

/** Every year of one apartment side by side, newest first; a tap opens that year's tax summary. */
export default function History({ apt, thisYear, scope, onScope, onPick }: Props) {
  const { t } = useI18n();
  const shared = apt.mySharePct !== 100;

  const years = new Set<number>([thisYear]);
  apt.rents.forEach((r) => years.add(Number(r.month.slice(0, 4))));
  apt.costs.forEach((c) => years.add(Number(c.date.slice(0, 4))));

  const rows = [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const tax = computeTax(apt, year);
      return { year, f: shared && scope === 'mine' ? ownerShare(tax, apt.mySharePct) : tax };
    });
  const total = rows.reduce((sum, r) => sum + r.f.netIncome, 0);

  return (
    <>
      <section className="hero">
        {shared && <ScopeToggle sharePct={apt.mySharePct} scope={scope} onScope={onScope} />}
        <div className="label" style={{ marginTop: shared ? 10 : 0 }}>
          {t('history.allYears')}
          <Info about={t('history.allYearsAbout')}>{t('history.allYearsInfo')}</Info>
        </div>
        <div className={'big ' + (total < 0 ? 'neg' : '')} data-testid="history-total">
          <Money value={total} />
        </div>
      </section>

      <section>
        <Heading>{t('history.years')}</Heading>
        <ul className="list card">
          {rows.map(({ year, f }) => (
            <li key={year}>
              <button className="row-btn" onClick={() => onPick(year)}>
                <div className="main">
                  <div className="t">{year}</div>
                  <div className="s">
                    {t('history.summary', {
                      rent: eurWhole(f.rentIncome),
                      costs: eurWhole(deductionsOf(f)),
                    })}
                  </div>
                </div>
                <div className={'strong num ' + (f.netIncome < 0 ? 'neg' : '')} title={t('history.netTitle', { year })}>
                  {eur(f.netIncome)}
                </div>
                {Icon.right}
              </button>
            </li>
          ))}
        </ul>
        {rows.length === 1 && <p className="msg">{t('history.onlyOne')}</p>}
        <p className="msg">{t('history.hint')}</p>
      </section>
    </>
  );
}
