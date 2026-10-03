'use client';

import { useState } from 'react';
import type { ApartmentView, RentEntry, RentStatus } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { computeTax, eur, MONTHS } from '@/lib/domain/tax';
import { monthTitle } from '@/lib/ui/format';
import { ErrorNote, Heading, Info, Money, Segmented, Sheet } from '@/components/ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

export default function RentLog({ apt, year, onChanged }: Props) {
  const [editing, setEditing] = useState<{ month: string; entry?: RentEntry } | null>(null);
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const t = computeTax(apt, year);
  const coOwned = apt.owners.length > 1 || apt.invites.length > 0;

  return (
    <>
      <section className="hero">
        <div className="label">
          Rent received · {year}
          <Info about="rent timing">
            Rent is taxed in the year you receive it, so the received date decides which year it counts in.
            {coOwned && ' Log the rent for the whole apartment — each owner’s share is worked out for you.'}
          </Info>
        </div>
        <div className="big">
          <Money value={t.rentIncome} />
        </div>
      </section>

      <section>
        <Heading>Months</Heading>
        <div className="months">
          {MONTHS.map((name, i) => {
            const month = `${year}-${String(i + 1).padStart(2, '0')}`;
            const entry = apt.rents.find((r) => r.month === month);
            const future = month > nowKey;
            const cls = entry ? entry.status : future ? 'future' : 'todo-m';
            return (
              <button key={month} className={'month ' + cls} onClick={() => setEditing({ month, entry })}>
                <span className="m">{name}</span>
                <span className="a">
                  {!entry && (future ? '—' : 'Add')}
                  {entry?.status === 'paid' && eur(entry.amount)}
                  {entry?.status === 'vacant' && 'Vacant'}
                  {entry?.status === 'unpaid' && 'Unpaid'}
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
    <Sheet title={monthTitle(month)} onClose={onClose}>
      <Segmented<RentStatus>
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'paid', label: 'Paid' },
          { value: 'vacant', label: 'Vacant' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
      />
      {status === 'paid' && (
        <div className="cols">
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
      {status === 'unpaid' && (
        <p className="msg" style={{ marginTop: 12 }}>
          Unpaid rent isn’t counted as income until you receive it.
        </p>
      )}
      {showNote ? (
        <>
          <label htmlFor="rent-note">Note</label>
          <input
            id="rent-note"
            autoFocus
            value={note}
            placeholder={status === 'vacant' ? 'e.g. between tenants' : ''}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      ) : (
        <button className="link" style={{ marginTop: 14 }} onClick={() => setShowNote(true)}>
          + Add a note
        </button>
      )}
      <ErrorNote message={error} />
      <div className="sheet-foot">
        {entry && (
          <button className="btn danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button
          className="btn primary"
          onClick={save}
          disabled={busy || (status === 'paid' && !(Number(amount) > 0 && date))}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}
