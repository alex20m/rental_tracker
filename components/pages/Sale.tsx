'use client';

import { useState } from 'react';
import { ACQUISITION_KINDS } from '@/lib/domain/types';
import type { AcquisitionCost, AcquisitionKind, ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeSale, suggestedSale } from '@/lib/domain/sale';
import { eur } from '@/lib/domain/tax';
import { shortDate } from '@/lib/ui/format';
import { ruleParams } from '@/lib/ui/ruleParams';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Info, Label, Money, Sheet, Switch } from '@/components/ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Props = { apt: ApartmentView; onChanged: () => Promise<void> };

const text = (n: number) => (n ? String(n) : '');

/**
 * Selling one's own part of the apartment: what it cost to acquire, what it
 * sold for, the gain by the actual costs and by the assumed acquisition cost,
 * and the tax on the better of the two. Everything here is the viewer's own and
 * private to them — their purchase, their sale, their acquisition costs, each
 * as their own part — so no ownership share is applied to it. What they say
 * about their other capital income and whether it was their home is not even
 * stored.
 */
export default function Sale({ apt, onChanged }: Props) {
  const { t, tn, lang } = useI18n();
  const start = apt.mySale ?? suggestedSale(apt.settings, apt.mySharePct);
  const [purchaseDate, setPurchaseDate] = useState(start.purchaseDate);
  const [purchasePrice, setPurchasePrice] = useState(text(start.purchasePrice));
  const [saleDate, setSaleDate] = useState(start.saleDate);
  const [salePrice, setSalePrice] = useState(text(start.salePrice));
  const [saleCosts, setSaleCosts] = useState(text(start.saleCosts));
  const [otherIncome, setOtherIncome] = useState('');
  const [livedIn, setLivedIn] = useState(false);
  const [editing, setEditing] = useState<AcquisitionCost | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const result = apt.mySale
    ? computeSale(apt, apt.mySale, {
        sharePct: apt.mySharePct,
        otherCapitalIncome: Math.max(Number(otherIncome), 0),
        livedIn,
      })
    : null;
  const params = ruleParams(result?.year ?? new Date().getFullYear(), lang);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const save = () =>
    run(() =>
      api.putSale(apt.id, {
        purchaseDate,
        purchasePrice: Number(purchasePrice),
        saleDate,
        salePrice: Number(salePrice),
        saleCosts: Number(saleCosts),
      }),
    );

  const clear = async () => {
    await run(() => api.deleteSale(apt.id));
    // Back to where an owner with no sale starts, not to the sale just removed.
    const fresh = suggestedSale(apt.settings, apt.mySharePct);
    setPurchaseDate(fresh.purchaseDate);
    setPurchasePrice(text(fresh.purchasePrice));
    setSaleDate('');
    setSalePrice('');
    setSaleCosts('');
  };

  return (
    <>
      <section className="hero">
        <div className="label">
          {result ? (result.gain >= 0 ? t('sale.heroGain') : t('sale.heroLoss')) : t('sale.heroNone')}
        </div>
        {result ? (
          <>
            <div className={'big ' + (result.gain < 0 ? 'neg' : '')}>
              <Money value={result.gain} />
            </div>
            <div className="label" style={{ marginTop: 4 }}>
              {result.taxFree ? (
                <span className="chip">{t('sale.taxFreeShort')}</span>
              ) : (
                <>
                  {t('sale.tax')}{' '}
                  <b className="num" style={{ margin: '0 2px', color: 'var(--text)' }}>
                    {eur(result.tax)}
                  </b>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="lead">{apt.mySale ? t('sale.heroSaved') : t('sale.heroNoneHint')}</p>
        )}
      </section>

      <section className="section">
        <Heading info={<Info about={t('sale.detailsAbout')}>{t('sale.detailsInfo')}</Info>}>{t('sale.details')}</Heading>
        <div className="card pad">
          <Label
            htmlFor="sale-purchase-date"
            info={<Info about={t('sale.purchaseAbout')}>{t('sale.purchaseInfo', params)}</Info>}
          >
            {t('sale.purchaseDate')}
          </Label>
          <input id="sale-purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          <label htmlFor="sale-purchase-price">{t('sale.purchasePrice')}</label>
          <input
            id="sale-purchase-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
          <label htmlFor="sale-date">{t('sale.date')}</label>
          <input id="sale-date" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          <label htmlFor="sale-price">{t('sale.price')}</label>
          <input
            id="sale-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
          <Label htmlFor="sale-costs" info={<Info about={t('sale.costsAbout')}>{t('sale.costsInfo')}</Info>}>
            {t('sale.costs')}
          </Label>
          <input
            id="sale-costs"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={saleCosts}
            onChange={(e) => setSaleCosts(e.target.value)}
          />
          <ErrorNote message={error} />
          <div className="sheet-foot">
            {apt.mySale && (
              <button className="btn danger" onClick={clear} disabled={busy}>
                {t('sale.clear')}
              </button>
            )}
            <button className="btn primary" disabled={busy} onClick={save}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <Heading
          info={<Info about={t('sale.acqAbout')}>{t('sale.acqInfo')}</Info>}
          action={
            <button className="btn" onClick={() => setEditing('new')}>
              {t('sale.acqAdd')}
            </button>
          }
        >
          {t('sale.acq')}
        </Heading>
        {apt.acquisitionCosts.length === 0 ? (
          <div className="empty">{t('sale.acqNone')}</div>
        ) : (
          <ul className="list card">
            {apt.acquisitionCosts.map((c) => (
              <li key={c.id}>
                <button className="row-btn" onClick={() => setEditing(c)}>
                  <div className="main">
                    <div className="t">{c.description || t(`sale.kind.${c.kind}`)}</div>
                    <div className="s">
                      {shortDate(c.date, lang)}
                      {c.description && ` · ${t(`sale.kind.${c.kind}`)}`}
                    </div>
                  </div>
                  <div className="strong num">{eur(c.amount)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result && (
        <>
          <section className="section">
            <Heading info={<Info about={t('sale.compareAbout')}>{t('sale.compareInfo', params)}</Info>}>
              {t('sale.compare')}
            </Heading>
            <p className="msg">
              {result.ownedYears === null ? t('sale.ownedUnknown', params) : tn('sale.owned', result.ownedYears)}
            </p>

            <div className="card pad">
              <div className="kv">
                <b>{t('sale.actual')}</b>
                {result.best === 'actual' && <span className="chip">{t('sale.better')}</span>}
              </div>
              <div className="kv">
                <span>{t('sale.row.price')}</span>
                <span className="num">{eur(apt.mySale!.salePrice)}</span>
              </div>
              <div className="kv">
                <span>{t('sale.row.purchasePrice')}</span>
                <span className="num">{eur(-result.actual.purchasePrice)}</span>
              </div>
              {ACQUISITION_KINDS.filter((k) => result.actual.byKind[k] !== undefined).map((k) => (
                <div className="kv" key={k}>
                  <span>{t(`sale.kind.${k}`)}</span>
                  <span className="num">{eur(-result.actual.byKind[k]!)}</span>
                </div>
              ))}
              {result.actual.depreciation > 0 && (
                <div className="kv">
                  <span>{t('sale.row.depreciation')}</span>
                  <span className="num">{eur(result.actual.depreciation)}</span>
                </div>
              )}
              <div className="kv">
                <span>{t('sale.row.saleCosts')}</span>
                <span className="num">{eur(-result.actual.saleCosts)}</span>
              </div>
              <div className="kv sum">
                <span>{t('sale.row.gain')}</span>
                <span className="num">{eur(result.actual.gain)}</span>
              </div>
            </div>

            <div className="card pad" style={{ marginTop: 12 }}>
              <div className="kv">
                <b>{t('sale.assumed')}</b>
                {result.best === 'assumed' && <span className="chip">{t('sale.better')}</span>}
              </div>
              <div className="kv">
                <span>{t('sale.row.price')}</span>
                <span className="num">{eur(apt.mySale!.salePrice)}</span>
              </div>
              <div className="kv">
                <span>{t('sale.assumedRate', { rate: result.assumed.rate * 100 })}</span>
                <span className="num">{eur(-result.assumed.amount)}</span>
              </div>
              <div className="kv sum">
                <span>{t('sale.row.gain')}</span>
                <span className="num">{eur(result.assumed.gain)}</span>
              </div>
            </div>
          </section>

          <section className="section">
            <Heading>{t('sale.myTax')}</Heading>
            <div className="card pad">
              <Label
                htmlFor="sale-other-income"
                info={<Info about={t('sale.otherIncomeAbout')}>{t('sale.otherIncomeInfo', params)}</Info>}
              >
                {t('sale.otherIncome')}
              </Label>
              <input
                id="sale-other-income"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={otherIncome}
                onChange={(e) => setOtherIncome(e.target.value)}
              />
              <div style={{ marginTop: 12 }}>
                <Switch checked={livedIn} onChange={setLivedIn}>
                  {t('sale.livedIn', params)}
                </Switch>
                <Info about={t('sale.livedInAbout')}>{t('sale.livedInInfo', params)}</Info>
              </div>
              {result.taxFree ? (
                <p className="msg">{t('sale.taxFree', params)}</p>
              ) : (
                <div className="kv sum">
                  <span>{t('sale.taxLine')}</span>
                  <span className="num">{eur(result.tax)}</span>
                </div>
              )}
              {result.loss > 0 && (
                <p className="msg">{result.lossDeductible ? t('sale.lossDeductible', params) : t('sale.lossNotDeductible')}</p>
              )}
              <p className="msg">{t('sale.report')}</p>
            </div>
          </section>
        </>
      )}

      {editing && (
        <AcquisitionForm
          apt={apt}
          cost={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function AcquisitionForm({
  apt,
  cost,
  onClose,
  onChanged,
}: {
  apt: ApartmentView;
  cost?: AcquisitionCost;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(cost?.date ?? todayIso());
  const [kind, setKind] = useState<AcquisitionKind>(cost?.kind ?? 'transfer_tax');
  const [description, setDescription] = useState(cost?.description ?? '');
  const [amount, setAmount] = useState(cost ? String(cost.amount) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const save = () =>
    run(() => {
      const entry = { date, kind, description: description.trim(), amount: Number(amount) };
      return cost ? api.updateAcquisition(apt.id, cost.id, entry) : api.createAcquisition(apt.id, entry);
    });

  return (
    <Sheet title={cost ? t('sale.acqEdit') : t('sale.acqAdd')} onClose={onClose}>
      <label htmlFor="acq-amount" style={{ marginTop: 6 }}>
        {t('sale.acqAmount')}
      </label>
      <input
        id="acq-amount"
        className="amount-input"
        type="number"
        inputMode="decimal"
        step="0.01"
        autoFocus={!cost}
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <Label id="acq-kind">{t('sale.acqKind')}</Label>
      <div className="chips" role="radiogroup" aria-labelledby="acq-kind">
        {ACQUISITION_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className="choice" onClick={() => setKind(k)}>
            {t(`sale.kind.${k}`)}
          </button>
        ))}
      </div>

      <label htmlFor="acq-description">{t('sale.acqDescription')}</label>
      <input
        id="acq-description"
        value={description}
        placeholder={t('sale.acqDescriptionPlaceholder')}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label htmlFor="acq-date">{t('sale.acqDate')}</label>
      <input id="acq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <ErrorNote message={error} />
      <div className="sheet-foot">
        {cost && (
          <button className="btn danger" disabled={busy} onClick={() => run(() => api.deleteAcquisition(apt.id, cost.id))}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={!(Number(amount) > 0 && date) || busy}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
