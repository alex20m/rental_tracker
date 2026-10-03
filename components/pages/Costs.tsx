'use client';

import { useRef, useState } from 'react';
import type { ApartmentView, CostCategory, CostEntry } from '@/lib/domain/types';
import { CATEGORIES, COST_CATEGORIES } from '@/lib/domain/types';
import { api, compressImage } from '@/lib/client/api';
import { eur } from '@/lib/domain/tax';
import type { MessageKey } from '@/lib/i18n';
import { shortDate } from '@/lib/ui/format';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Icon, Info, Label, Money, Sheet } from '@/components/ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

function Thumb({ apt, cost }: { apt: ApartmentView; cost: CostEntry }) {
  const { t } = useI18n();
  return cost.hasReceipt ? (
    // eslint-disable-next-line @next/next/no-img-element -- a private, per-user image; not for the image optimizer
    <img className="thumb" src={api.receiptUrl(apt.id, cost.id)} alt={t('costs.receipt')} loading="lazy" />
  ) : (
    <span className="thumb missing" role="img" aria-label={t('costs.noReceipt')} title={t('costs.noReceiptYet')}>
      {Icon.camera}
    </span>
  );
}

export default function Costs({ apt, year, onChanged }: Props) {
  const { t, tn, lang } = useI18n();
  const [editing, setEditing] = useState<CostEntry | 'new' | null>(null);
  const list = apt.costs.filter((c) => c.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.filter((c) => CATEGORIES[c.category].deductible).reduce((a, c) => a + c.amount, 0);
  const coOwned = apt.owners.length > 1 || apt.invites.length > 0;

  return (
    <>
      <section className="hero">
        <div className="label">
          {t('costs.deductible', { year })}
          <Info about={t('costs.about')}>
            {tn('costs.entries', list.length)}
            {t('costs.financingInfo')}
            {coOwned && t('costs.coOwned')}
          </Info>
        </div>
        <div className="big">
          <Money value={total} />
        </div>
      </section>

      <section>
        {list.length === 0 ? (
          <div className="empty">{t('costs.none', { year })}</div>
        ) : (
          <ul className="list">
            {list.map((c) => (
              <li key={c.id}>
                <button className="row-btn" onClick={() => setEditing(c)}>
                  <Thumb apt={apt} cost={c} />
                  <div className="main">
                    <div className="t">{c.description || t(`cat.${c.category}.label`)}</div>
                    <div className="s">
                      {shortDate(c.date, lang)}
                      {c.description && ` · ${t(`cat.${c.category}.label`)}`}{' '}
                      {!CATEGORIES[c.category].deductible && (
                        <span className="chip warn">{t('common.notDeductible')}</span>
                      )}
                    </div>
                  </div>
                  <div className={'strong num ' + (CATEGORIES[c.category].deductible ? '' : 'dim')}>
                    {eur(c.amount)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn primary fab" aria-label={t('costs.add')} onClick={() => setEditing('new')}>
        {Icon.plus}
      </button>
      {editing && (
        <CostForm
          apt={apt}
          cost={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function CostForm({
  apt,
  cost,
  onClose,
  onChanged,
}: {
  apt: ApartmentView;
  cost?: CostEntry;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(cost?.date ?? todayIso());
  const [category, setCategory] = useState<CostCategory>(cost?.category ?? 'maintenance_charge');
  const [description, setDescription] = useState(cost?.description ?? '');
  const [amount, setAmount] = useState(cost ? String(cost.amount) : '');
  const [newImage, setNewImage] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const existing = cost?.hasReceipt ? api.receiptUrl(apt.id, cost.id) : undefined;
  const preview = removeImage ? undefined : (newImage ?? existing);

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      setNewImage(await compressImage(f));
      setRemoveImage(false);
    } catch {
      setError(t('common.imageUnreadable'));
    }
    setBusy(false);
  };

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
      const entry = { date, category, description: description.trim(), amount: Number(amount) || 0 };
      const id = cost
        ? (await api.updateCost(apt.id, cost.id, entry), cost.id)
        : (await api.createCost(apt.id, entry)).id;
      if (newImage) await api.putReceipt(apt.id, id, newImage);
      else if (removeImage && cost?.hasReceipt) await api.deleteReceipt(apt.id, id);
    });

  const remove = () => run(() => api.deleteCost(apt.id, cost!.id));

  const cat = CATEGORIES[category];

  return (
    <Sheet title={cost ? t('costs.edit') : t('costs.add')} onClose={onClose}>
      <label htmlFor="cost-amount" style={{ marginTop: 6 }}>
        {t('costs.amount')}
      </label>
      <input
        id="cost-amount"
        className="amount-input"
        type="number"
        inputMode="decimal"
        step="0.01"
        autoFocus={!cost}
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <Label
        id="cost-category"
        info={<Info about={t('costs.categoryAbout')}>{t('costs.categoryInfo', { fi: cat.fi })}</Info>}
      >
        {t('costs.category')}
      </Label>
      <div className="chips" role="radiogroup" aria-labelledby="cost-category">
        {COST_CATEGORIES.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={category === k}
            className="choice"
            onClick={() => setCategory(k)}
          >
            {t(`cat.${k}.label`)}
          </button>
        ))}
      </div>
      {!cat.deductible && (
        <div style={{ marginTop: 8 }}>
          <span className="chip warn">{t('common.notDeductibleCap')}</span>
          <Info about={t('costs.notDeductibleAbout')}>{t(`cat.${category}.hint` as MessageKey)}</Info>
        </div>
      )}

      <label htmlFor="cost-description">{t('costs.description')}</label>
      <input
        id="cost-description"
        value={description}
        placeholder={t('costs.descriptionPlaceholder')}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="cols">
        <div>
          <label htmlFor="cost-date">{t('costs.date')}</label>
          <input id="cost-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cost-receipt">{t('costs.receipt')}</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <button
            id="cost-receipt"
            className="btn block"
            style={{ padding: '11px 8px' }}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {Icon.camera}
            {busy ? t('costs.processing') : preview ? t('costs.replacePhoto') : t('costs.addPhoto')}
          </button>
        </div>
      </div>
      {preview && (
        <div className="receipt-box" style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or a private, per-user image */}
          <img className="receipt-img" src={preview} alt={t('costs.receiptPreview')} />
          <div className="receipt-tools">
            <button
              className="btn danger"
              onClick={() => {
                setNewImage(undefined);
                setRemoveImage(true);
              }}
            >
              {t('common.remove')}
            </button>
          </div>
        </div>
      )}

      <ErrorNote message={error} />
      <div className="sheet-foot">
        {cost && (
          <button className="btn danger" onClick={remove} disabled={busy}>
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
