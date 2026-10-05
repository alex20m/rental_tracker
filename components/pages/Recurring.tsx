'use client';

import { useState } from 'react';
import type { ApartmentView, CostCategory, RecurringEntry } from '@/lib/domain/types';
import { RECURRING_CATEGORIES } from '@/lib/domain/recurring';
import { api } from '@/lib/client/api';
import { eur } from '@/lib/domain/tax';
import { monthTitle } from '@/lib/ui/format';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Icon, Info, Label, Segmented, Sheet } from '@/components/ui';

type Props = { apt: ApartmentView; onChanged: () => Promise<void> };

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * The costs and the rent that book themselves every month. Each row is one
 * recurring entry; what it has booked is in Rent and Costs, not here.
 */
export default function Recurring({ apt, onChanged }: Props) {
  const { t, tn, lang } = useI18n();
  const [editing, setEditing] = useState<RecurringEntry | 'new' | null>(null);

  return (
    <>
      {apt.recurring.length === 0 ? (
        <div className="empty">{t('recurring.empty')}</div>
      ) : (
        <ul className="list card">
          {apt.recurring.map((r) => (
            <li key={r.id}>
              <button className="row-btn" onClick={() => setEditing(r)}>
                {r.kind === 'rent' ? Icon.rent : Icon.cost}
                <div className="main">
                  <div className="t">{r.description || (r.category ? t(`cat.${r.category}.label`) : t('recurring.rentTitle'))}</div>
                  <div className="s">
                    {r.category && r.description && `${t(`cat.${r.category}.label`)} · `}
                    {t('recurring.next', { day: r.dayOfMonth, month: monthTitle(r.nextMonth, lang) })}
                  </div>
                </div>
                <div className="strong num">{t('recurring.perMonth', { amount: eur(r.amount) })}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="msg">{tn('settings.recurringCount', apt.recurring.length)}</p>

      <button className="btn primary fab" aria-label={t('recurring.add')} onClick={() => setEditing('new')}>
        {Icon.plus}
      </button>
      {editing && (
        <RecurringForm
          apt={apt}
          entry={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function RecurringForm({
  apt,
  entry,
  onClose,
  onChanged,
}: {
  apt: ApartmentView;
  entry?: RecurringEntry;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  // The rent repeats as one entry per apartment, so once it does there is nothing else to pick.
  const rentTaken = apt.recurring.some((r) => r.kind === 'rent');
  const [kind, setKind] = useState<'cost' | 'rent'>(entry?.kind ?? (rentTaken ? 'cost' : 'rent'));
  const [category, setCategory] = useState<CostCategory>(entry?.category ?? 'maintenance_charge');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [day, setDay] = useState(String(entry?.dayOfMonth ?? 1));
  const [firstMonth, setFirstMonth] = useState(currentMonth());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const validDay = Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= 28;

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
      const base = { description: description.trim(), amount: Number(amount), dayOfMonth: Number(day) };
      if (entry) return api.updateRecurring(apt.id, entry.id, kind === 'cost' ? { ...base, category } : base);
      return api.createRecurring(
        apt.id,
        kind === 'cost' ? { kind, category, ...base, firstMonth } : { kind, ...base, firstMonth },
      );
    });
  const remove = () => run(() => api.deleteRecurring(apt.id, entry!.id));

  return (
    <Sheet title={entry ? t('recurring.edit') : t('recurring.add')} onClose={onClose}>
      {!entry && !rentTaken && (
        <Segmented<'cost' | 'rent'>
          label={t('recurring.kind')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'rent', label: t('recurring.kind.rent') },
            { value: 'cost', label: t('recurring.kind.cost') },
          ]}
        />
      )}

      <label htmlFor="recurring-amount" style={{ marginTop: 6 }}>
        {t('recurring.amount')}
      </label>
      <input
        id="recurring-amount"
        className="amount-input"
        type="number"
        inputMode="decimal"
        step="0.01"
        autoFocus={!entry}
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      {kind === 'cost' && (
        <>
          <Label id="recurring-category">{t('costs.category')}</Label>
          <div className="chips" role="radiogroup" aria-labelledby="recurring-category">
            {RECURRING_CATEGORIES.map((k) => (
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
        </>
      )}

      <label htmlFor="recurring-description">{t('costs.description')}</label>
      <input
        id="recurring-description"
        value={description}
        placeholder={t('costs.descriptionPlaceholder')}
        onChange={(e) => setDescription(e.target.value)}
      />

      <Label
        htmlFor="recurring-day"
        info={<Info about={t('recurring.dayAbout')}>{t('recurring.dayInfo')}</Info>}
      >
        {t('recurring.day')}
      </Label>
      <input
        id="recurring-day"
        type="number"
        inputMode="numeric"
        min="1"
        max="28"
        step="1"
        value={day}
        onChange={(e) => setDay(e.target.value)}
      />

      {entry ? (
        <p className="msg">{t('recurring.editNote')}</p>
      ) : (
        <>
          <Label
            htmlFor="recurring-first"
            info={<Info about={t('recurring.firstMonthAbout')}>{t('recurring.firstMonthInfo')}</Info>}
          >
            {t('recurring.firstMonth')}
          </Label>
          <input id="recurring-first" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} />
        </>
      )}

      <ErrorNote message={error} />
      <div className="sheet-foot">
        {entry && (
          <button className="btn danger" onClick={remove} disabled={busy}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={busy || !(Number(amount) > 0) || !validDay || !(entry || firstMonth)}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
