'use client';

import { useState } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { CATEGORIES } from '@/lib/domain/types';
import { computeTax, eur, ownerShare } from '@/lib/domain/tax';
import { buildChecklist } from '@/lib/domain/checklist';
import { buildPackage, buildPdf } from '@/lib/client/declaration';
import { download } from '@/lib/client/api';
import { useI18n } from '@/components/I18nProvider';
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
  const i18n = useI18n();
  const { t } = i18n;
  const tax = computeTax(apt, year);
  const mine = ownerShare(tax, apt.mySharePct);
  const shared = apt.mySharePct !== 100;
  const f = shared && scope === 'whole' ? tax : mine;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checklist = buildChecklist({ apt, tax }, i18n);

  const makePackage = async () => {
    setBusy(true);
    setError('');
    try {
      download(await buildPackage(apt, year, taxpayerName), `rental-tax-${year}.zip`);
    } catch (e) {
      setError(t('tax.packageFailed', { message: (e as Error).message }));
    }
    setBusy(false);
  };

  return (
    <>
      <section className="hero">
        {shared && <ScopeToggle sharePct={apt.mySharePct} scope={scope} onScope={onScope} />}
        <div className="label" style={{ marginTop: shared ? 10 : 0 }}>
          {f.netIncome >= 0 ? t('tax.taxable') : t('home.rentalLoss')} · {year}
          {shared && <Info about={t('tax.coOwnedAbout')}>{t('tax.coOwnedInfo')}</Info>}
        </div>
        <div className={'big ' + (f.netIncome < 0 ? 'neg' : '')}>
          <Money value={f.netIncome} />
        </div>
        <div className="label" style={{ marginTop: 4 }}>
          {t('tax.estimated')}{' '}
          <b className="num" style={{ margin: '0 2px', color: 'var(--text)' }}>
            {eur(f.estimatedTax)}
          </b>
          <Info about={t('home.estTaxAbout')}>{t('tax.estimateInfo')}</Info>
        </div>
      </section>

      <section>
        <Heading>{t('tax.beforeFiling')}</Heading>
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
        <Heading>{t('tax.income')}</Heading>
        <div className="card pad">
          <div className="kv">
            <span>
              {t('tax.rentReceived')}
              <Info about={t('tax.rentMonthsAbout')}>
                {t('tax.rentMonthsInfo', {
                  paid: tax.paidMonths,
                  vacant: tax.vacantMonths,
                  unpaid: tax.unpaidMonths,
                  year,
                })}
              </Info>
            </span>
            <span className="num">{eur(f.rentIncome)}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <Heading>{t('tax.expenses')}</Heading>
        <div className="card pad">
          {f.lines.length === 0 && f.depreciation === 0 && <div className="kv dim">{t('tax.noCosts', { year })}</div>}
          {f.lines.map((l) => {
            const label = t(`cat.${l.category}.label`);
            return (
              <div className={'kv' + (l.deductible ? '' : ' faded')} key={l.category}>
                <span>
                  {label}
                  {!l.deductible && (
                    <span className="chip warn" style={{ marginLeft: 6 }}>
                      {t('common.notDeductible')}
                    </span>
                  )}
                  {CATEGORIES[l.category].treatment === 'interest' && (
                    <span className="chip" style={{ marginLeft: 6 }}>
                      {t('tax.separately')}
                    </span>
                  )}
                  <Info about={label}>
                    {t('costs.categoryInfo', { fi: l.fi })} {t(`cat.${l.category}.hint`)}
                  </Info>
                </span>
                <span className="num">{eur(l.amount)}</span>
              </div>
            );
          })}
          {f.depreciationLines.map((d) => (
            <div className="kv" key={d.kind}>
              <span>
                {t(`tax.depr.${d.kind}`)}
                <Info about={t(`tax.depr.${d.kind}`)}>{t(`tax.depr.${d.kind}Info`)}</Info>
              </span>
              <span className="num">{eur(d.amount)}</span>
            </div>
          ))}
          <div className="kv sum">
            <span>{t('tax.deductibleTotal')}</span>
            <span className="num">{eur(f.deductibleCosts + f.depreciation)}</span>
          </div>
        </div>
      </section>

      <section>
        <Heading info={<Info about={t('tax.packageAbout')}>{t('tax.packageInfo')}</Info>}>
          {t('tax.declaration')}
        </Heading>
        <ErrorNote message={error} />
        <button className="btn primary block" onClick={makePackage} disabled={busy}>
          {Icon.download}
          {busy ? t('tax.building') : t('tax.download', { year })}
        </button>
        <button
          className="btn quiet block"
          style={{ marginTop: 8 }}
          onClick={() => download(buildPdf(apt, tax, mine, taxpayerName), `vuokratulot-ja-menot-${year}.pdf`)}
        >
          {t('tax.pdfOnly')}
        </button>
      </section>
    </>
  );
}
