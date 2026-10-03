'use client';

import { useState } from 'react';
import type { ApartmentView, RentEntry, RentStatus } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeTax, eur } from '@/lib/domain/tax';
import { monthsShort, monthTitle } from '@/lib/ui/format';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Info, Money, Segmented, Sheet } from '@/components/ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

export default function RentLog({ apt, year, onChanged }: Props) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState<{ month: string; entry?: RentEntry } | null>(null);
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const tax = computeTax(apt, year);
  const coOwned = apt.owners.length > 1 || apt.invites.length > 0;

  return (
    <>
      <section className="hero">
        <div className="label">
          {t('rent.received', { year })}
          <Info about={t('rent.timingAbout')}>
            {t('rent.timingInfo')}
            {coOwned && t('rent.coOwned')}
          </Info>
        </div>
        <div className="big">
          <Money value={tax.rentIncome} />
        </div>
      </section>

      <section>
        <Heading>{t('rent.months')}</Heading>
        <div className="months">
          {monthsShort(lang).map((name, i) => {
            const month = `${year}-${String(i + 1).padStart(2, '0')}`;
            const entry = apt.rents.find((r) => r.month === month);
            const future = month > nowKey;
            const cls = entry ? entry.status : future ? 'future' : 'todo-m';
            return (
              <button key={month} className={'month ' + cls} onClick={() => setEditing({ month, entry })}>
                <span className="m">{name}</span>
                <span className="a">
                  {!entry && (future ? '—' : t('rent.add'))}
                  {entry?.status === 'paid' && eur(entry.amount)}
                  {entry?.status === 'vacant' && t('rent.vacant')}
                  {entry?.status === 'unpaid' && t('rent.unpaid')}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {editing && (
        <RentForm
          apt={apt}
          month={editing.month}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function RentForm({
  apt,
  month,
  entry,
  onClose,
  onChanged,
}: {
  apt: ApartmentView;
  month: string;
  entry?: RentEntry;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<RentStatus>(entry?.status ?? 'paid');
  const [amount, setAmount] = useState(String(entry?.amount || apt.settings.monthlyRent || ''));
  const [date, setDate] = useState(entry?.receivedDate || todayIso());
  const [note, setNote] = useState(entry?.note ?? '');
  const [showNote, setShowNote] = useState(!!entry?.note);
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
    run(() =>
      api.putRent(apt.id, month, {
        status,
        amount: status === 'paid' ? Number(amount) || 0 : 0,
        receivedDate: status === 'paid' ? date : '',
        note: note.trim(),
      }),
    );
  const remove = () => run(() => api.deleteRent(apt.id, month));

  return (
    <Sheet title={monthTitle(month, lang)} onClose={onClose}>
      <Segmented<RentStatus>
        label={t('rent.status')}
        value={status}
        onChange={setStatus}
        options={[
          { value: 'paid', label: t('rent.paid') },
          { value: 'vacant', label: t('rent.vacant') },
          { value: 'unpaid', label: t('rent.unpaid') },
        ]}
      />
      {status === 'paid' && (
        <div className="cols">
          <div>
            <label htmlFor="rent-amount">{t('rent.amount')}</label>
            <input
              id="rent-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="rent-date">{t('rent.receivedOn')}</label>
            <input id="rent-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}
      {status === 'unpaid' && (
        <p className="msg" style={{ marginTop: 12 }}>
          {t('rent.unpaidNote')}
        </p>
      )}
      {showNote ? (
        <>
          <label htmlFor="rent-note">{t('rent.note')}</label>
          <input
            id="rent-note"
            autoFocus
            value={note}
            placeholder={status === 'vacant' ? t('rent.notePlaceholder') : ''}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      ) : (
        <button className="link" style={{ marginTop: 14 }} onClick={() => setShowNote(true)}>
          {t('rent.addNote')}
        </button>
      )}
      <ErrorNote message={error} />
      <div className="sheet-foot">
        {entry && (
          <button className="btn danger" onClick={remove} disabled={busy}>
            {t('common.delete')}
          </button>
        )}
        <button
          className="btn primary"
          onClick={save}
          disabled={busy || (status === 'paid' && !(Number(amount) > 0 && date))}
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
