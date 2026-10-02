'use client';

import { useState } from 'react';
import type { ApartmentView, RentEntry, RentStatus } from '@/lib/domain/types';
import { RENT_STATUSES } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { eur, MONTHS } from '@/lib/domain/tax';
import { ErrorNote, Sheet } from '@/components/ui';

const todayIso = () => new Date().toISOString().slice(0, 10);

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

export default function RentLog({ apt, year, onChanged }: Props) {
  const [editing, setEditing] = useState<{ month: string; entry?: RentEntry } | null>(null);
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <>
      <div className="card">
        <h2>{year} — tap a month to log it</h2>
        <div className="months">
          {MONTHS.map((name, i) => {
            const month = `${year}-${String(i + 1).padStart(2, '0')}`;
            const entry = apt.rents.find((r) => r.month === month);
            const cls = entry ? entry.status : month > nowKey ? 'future' : '';
            return (
              <button key={month} className={'month ' + cls} onClick={() => setEditing({ month, entry })}>
                <div className="m">{name}</div>
                <div className="a">
                  {!entry && (month > nowKey ? '—' : 'Not logged')}
                  {entry?.status === 'paid' && eur(entry.amount)}
                  {entry?.status === 'vacant' && 'Vacant'}
                  {entry?.status === 'unpaid' && 'Unpaid'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="note" style={{ padding: '0 4px' }}>
        Rent is taxed in the year you receive it, so the received date decides which tax year it counts in.
        {apt.owners.length > 1 && ' Log the rent for the whole apartment — each owner’s share is worked out from it.'}
      </div>
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
  const [status, setStatus] = useState<RentStatus>(entry?.status ?? 'paid');
  const [amount, setAmount] = useState(String(entry?.amount || apt.settings.monthlyRent || ''));
  const [date, setDate] = useState(entry?.receivedDate || todayIso());
  const [note, setNote] = useState(entry?.note ?? '');
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
    <Sheet onClose={onClose}>
      <h3>Rent for {month}</h3>
      <label>Status</label>
      <div className="seg">
        {RENT_STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
            {s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {status === 'paid' && (
        <div className="row">
          <div>
            <label htmlFor="rent-amount">Amount received (€)</label>
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
            <label htmlFor="rent-date">Received on</label>
            <input id="rent-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}
      <label htmlFor="rent-note">Note</label>
      <input
        id="rent-note"
        value={note}
        placeholder={status === 'vacant' ? 'e.g. between tenants' : 'optional'}
        onChange={(e) => setNote(e.target.value)}
      />
      <ErrorNote message={error} />
      <div className="row" style={{ marginTop: 16 }}>
        {entry && (
          <button className="btn danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={busy || (status === 'paid' && !(Number(amount) > 0 && date))}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}
