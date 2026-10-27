'use client';

import { useRef, useState } from 'react';
import { ACQUISITION_KINDS } from '@/lib/domain/types';
import type { AcquisitionCost, AcquisitionKind, ApartmentView, SaleDetails } from '@/lib/domain/types';
import { api, compressImage } from '@/lib/client/api';
import { computeSale, suggestedSale } from '@/lib/domain/sale';
import { eur } from '@/lib/domain/tax';
import { shortDate } from '@/lib/ui/format';
import { ruleParams } from '@/lib/ui/ruleParams';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Icon, Info, Label, Money, PhotoLinks, Sheet, Switch } from '@/components/ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Props = { apt: ApartmentView; onChanged: () => Promise<void> };

const text = (n: number) => (n ? String(n) : '');

const NOTHING: SaleDetails = { purchaseDate: '', purchasePrice: 0, saleDate: '', salePrice: 0, saleCosts: 0 };

/**
 * Selling one's own part of the apartment: what it cost to acquire, what it
 * sold for, the gain by the actual costs and by the assumed acquisition cost,
 * and the tax on the better of the two. Everything here is the viewer's own and
 * private to them — their purchase, their sale, their acquisition costs, each
 * as their own part — so no ownership share is applied to it. The purchase and
 * the sale are saved separately, so a purchase noted years ahead is there when
 * it is time to sell. A photo can be kept with the purchase (the deed of sale)
 * and with each acquisition cost (its receipt or invoice), the proof the Tax
 * Administration can ask for. What the viewer says about their other capital income and
 * whether it was their home is not even stored.
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
  // The photo of the purchase as last picked, shown in place of the stored one
  // even once saved, and whether it still has to be saved or removed.
  const [picked, setPicked] = useState<string>();
  const [photoChange, setPhotoChange] = useState<'none' | 'new' | 'removed'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [purchaseError, setPurchaseError] = useState('');

  const kept = apt.mySale ?? NOTHING;
  const purchaseFieldsSaved = purchaseDate === kept.purchaseDate && Number(purchasePrice) === kept.purchasePrice;
  const photoPending = photoChange === 'new' || (photoChange === 'removed' && apt.myPurchaseHasPhoto);
  const purchaseSaved = purchaseFieldsSaved && !photoPending;
  const saleSaved = saleDate === kept.saleDate && Number(salePrice) === kept.salePrice && Number(saleCosts) === kept.saleCosts;
  const hasPurchase = kept.purchaseDate !== '' || kept.purchasePrice > 0 || apt.myPurchaseHasPhoto;
  const purchasePhoto =
    photoChange === 'removed' ? undefined : (picked ?? (apt.myPurchaseHasPhoto ? api.purchasePhotoUrl(apt.id) : undefined));

  const result = apt.mySale
    ? computeSale(apt, apt.mySale, {
        sharePct: apt.mySharePct,
        otherCapitalIncome: Math.max(Number(otherIncome), 0),
        livedIn,
      })
    : null;
  const params = ruleParams(result?.year ?? new Date().getFullYear(), lang);

  /** Runs `action` and reloads; a failure is said in the card it came from. */
  const run = async (fail: (message: string) => void, action: () => Promise<unknown>) => {
    setBusy(true);
    fail('');
    try {
      await action();
      await onChanged();
    } catch (e) {
      fail((e as Error).message);
    }
    setBusy(false);
  };

  /** Saves what changed of the purchase: its date and price, its photo, or both. */
  const savePurchase = () =>
    run(setPurchaseError, async () => {
      if (!purchaseFieldsSaved) await api.saveSale(apt.id, { purchaseDate, purchasePrice: Number(purchasePrice) });
      if (photoChange === 'new') await api.putPurchasePhoto(apt.id, picked!);
      else if (photoPending) await api.deletePurchasePhoto(apt.id);
      setPhotoChange('none');
    });

  const saveSale = () =>
    run(setError, () => api.saveSale(apt.id, { saleDate, salePrice: Number(salePrice), saleCosts: Number(saleCosts) }));

  /** Takes the sale back and leaves the purchase as it is. */
  const clearSale = async () => {
    await run(setError, () => api.saveSale(apt.id, { saleDate: '', salePrice: 0, saleCosts: 0 }));
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
        <Heading
          info={<Info about={t('sale.purchaseAbout')}>{t('sale.purchaseInfo', params)}</Info>}
          action={purchaseSaved && hasPurchase ? <span className="chip">{t('sale.saved')}</span> : undefined}
        >
          {t('sale.purchaseHeading')}
        </Heading>
        <div className="card pad">
          <div className="cols">
            <div>
              <label htmlFor="sale-purchase-date">{t('sale.purchaseDate')}</label>
              <input id="sale-purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
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
            </div>
          </div>
          <PhotoPicker
            id="sale-purchase-photo"
            label={t('sale.purchasePhoto')}
            previewAlt={t('sale.purchasePhotoPreview')}
            preview={purchasePhoto}
            saved={
              photoChange === 'none' && apt.myPurchaseHasPhoto
                ? { url: api.purchasePhotoUrl(apt.id), name: t('photo.deedFile') }
                : undefined
            }
            busy={busy}
            onBusy={setBusy}
            onPick={(dataUrl) => {
              setPicked(dataUrl);
              setPhotoChange('new');
            }}
            onRemove={() => {
              setPicked(undefined);
              setPhotoChange('removed');
            }}
            onError={setPurchaseError}
          />
          <ErrorNote message={purchaseError} />
          <div className="form-foot">
            <button className="btn primary small" disabled={busy || purchaseSaved} onClick={savePurchase}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <Heading
          info={<Info about={t('sale.detailsAbout')}>{t('sale.detailsInfo')}</Info>}
          action={saleSaved && kept.saleDate !== '' ? <span className="chip">{t('sale.saved')}</span> : undefined}
        >
          {t('sale.details')}
        </Heading>
        <div className="card pad">
          <div className="cols">
            <div>
              <label htmlFor="sale-date">{t('sale.date')}</label>
              <input id="sale-date" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
            <div>
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
            </div>
          </div>
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
          <div className="form-foot">
            {kept.saleDate !== '' && (
              <button className="btn danger small" onClick={clearSale} disabled={busy}>
                {t('sale.clear')}
              </button>
            )}
            <button className="btn primary small" disabled={busy || saleSaved} onClick={saveSale}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <Heading
          info={<Info about={t('sale.acqAbout')}>{t('sale.acqInfo')}</Info>}
          action={
            <button className="btn small" aria-label={t('sale.acqAdd')} onClick={() => setEditing('new')}>
              {Icon.plus}
              {t('sale.acqAddShort')}
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
                  {c.hasPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a private, per-user image; not for the image optimizer
                    <img className="thumb" src={api.acquisitionPhotoUrl(apt.id, c.id)} alt={t('sale.acqPhoto')} loading="lazy" />
                  ) : (
                    <span className="thumb missing" role="img" aria-label={t('sale.acqNoPhoto')}>
                      {Icon.camera}
                    </span>
                  )}
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
            <p className="msg" style={{ marginBottom: 12 }}>
              {result.ownedYears === null ? t('sale.ownedUnknown', params) : tn('sale.owned', result.ownedYears)}
            </p>

            <div className={'card pad' + (result.best === 'actual' ? ' best' : '')}>
              <div className="method-head">
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

            <div className={'card pad' + (result.best === 'assumed' ? ' best' : '')} style={{ marginTop: 12 }}>
              <div className="method-head">
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
              <div className="switch-row" style={{ margin: '14px 0 4px' }}>
                <Switch checked={livedIn} onChange={setLivedIn}>
                  {t('sale.livedIn', params)}
                </Switch>
                <Info about={t('sale.livedInAbout')}>{t('sale.livedInInfo', params)}</Info>
              </div>
              {result.taxFree ? (
                <p className="msg" style={{ margin: '8px 0 12px' }}>{t('sale.taxFree', params)}</p>
              ) : (
                <div className="kv sum" style={{ marginTop: 12 }}>
                  <span>{t('sale.taxLine')}</span>
                  <span className="num">{eur(result.tax)}</span>
                </div>
              )}
              {result.loss > 0 && (
                <p className="msg" style={{ marginBottom: 12 }}>
                  {result.lossDeductible ? t('sale.lossDeductible', params) : t('sale.lossNotDeductible')}
                </p>
              )}
              <p className="msg" style={{ margin: '4px 0 12px' }}>{t('sale.report')}</p>
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
  const [newImage, setNewImage] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = cost?.hasPhoto ? api.acquisitionPhotoUrl(apt.id, cost.id) : undefined;

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
    run(async () => {
      const entry = { date, kind, description: description.trim(), amount: Number(amount) };
      const id = cost
        ? (await api.updateAcquisition(apt.id, cost.id, entry), cost.id)
        : (await api.createAcquisition(apt.id, entry)).id;
      if (newImage) await api.putAcquisitionPhoto(apt.id, id, newImage);
      else if (removeImage && cost?.hasPhoto) await api.deleteAcquisitionPhoto(apt.id, id);
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

      <PhotoPicker
        id="acq-photo"
        label={t('sale.acqPhoto')}
        previewAlt={t('sale.acqPhotoPreview')}
        preview={removeImage ? undefined : (newImage ?? existing)}
        saved={!newImage && existing ? { url: existing, name: `${t('photo.receiptFile')}-${cost!.date}` } : undefined}
        busy={busy}
        onBusy={setBusy}
        onPick={(dataUrl) => {
          setNewImage(dataUrl);
          setRemoveImage(false);
        }}
        onRemove={() => {
          setNewImage(undefined);
          setRemoveImage(true);
        }}
        onError={setError}
      />

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

/**
 * A photo kept with an entry: a button that picks one from the camera, the
 * photo library or files — shrunk as a cost's receipt is — and, once there is
 * one, its preview with a button to remove it and, when the preview is the
 * stored photo (`saved`), buttons to open and download it. Nothing is uploaded
 * here; the form it is in saves it.
 */
function PhotoPicker({
  id,
  label,
  previewAlt,
  preview,
  saved,
  busy,
  onBusy,
  onPick,
  onRemove,
  onError,
}: {
  id: string;
  label: string;
  previewAlt: string;
  preview: string | undefined;
  saved: { url: string; name: string } | undefined;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onPick: (dataUrl: string) => void;
  onRemove: () => void;
  /** Says what went wrong: a photo that could not be read, or downloaded. */
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    onBusy(true);
    try {
      onPick(await compressImage(f));
    } catch {
      onError(t('common.imageUnreadable'));
    }
    onBusy(false);
  };

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button
        id={id}
        type="button"
        className="btn block"
        style={{ padding: '11px 8px' }}
        onClick={() => fileRef.current!.click()}
        disabled={busy}
      >
        {Icon.camera}
        {busy ? t('costs.processing') : preview ? t('costs.replacePhoto') : t('costs.addPhoto')}
      </button>
      {preview && (
        <div className="receipt-box" style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or a private, per-user image */}
          <img className="receipt-img" src={preview} alt={previewAlt} />
          <div className="receipt-tools">
            {saved && <PhotoLinks {...saved} onError={onError} />}
            <button type="button" className="btn danger" onClick={onRemove}>
              {t('common.remove')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
