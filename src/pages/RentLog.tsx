import { useState } from 'react';
import type { DB, RentEntry, RentStatus } from '../types';
import { update, uid } from '../store';
import { eur, MONTHS } from '../tax';
import { Sheet } from '../ui';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function RentLog({ db, year }: { db: DB; year: number }) {
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
            const entry = db.rents.find((r) => r.month === month);
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
      </div>
      {editing && <RentForm db={db} month={editing.month} entry={editing.entry} onClose={() => setEditing(null)} />}
    </>
  );
}

function RentForm({ db, month, entry, onClose }: { db: DB; month: string; entry?: RentEntry; onClose: () => void }) {
  const [status, setStatus] = useState<RentStatus>(entry?.status ?? 'paid');
  const [amount, setAmount] = useState(String(entry?.amount ?? (db.settings.monthlyRent || '')));
  const [date, setDate] = useState(entry?.receivedDate || todayIso());
  const [note, setNote] = useState(entry?.note ?? '');

  const save = () => {
    const e: RentEntry = {
      id: entry?.id ?? uid(),
      month,
      status,
      amount: status === 'paid' ? Number(amount) || 0 : 0,
      receivedDate: status === 'paid' ? date : '',
      note,
    };
    update((d) => ({ ...d, rents: [...d.rents.filter((r) => r.month !== month), e] }));
    onClose();
  };
  const remove = () => {
    update((d) => ({ ...d, rents: d.rents.filter((r) => r.month !== month) }));
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <h3>Rent for {month}</h3>
      <label>Status</label>
      <div className="seg">
        {(['paid', 'vacant', 'unpaid'] as RentStatus[]).map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {status === 'paid' && (
        <div className="row">
          <div>
            <label>Amount received (€)</label>
            <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label>Received on</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}
      <label>Note</label>
      <input value={note} placeholder={status === 'vacant' ? 'e.g. between tenants' : 'optional'} onChange={(e) => setNote(e.target.value)} />
      <div className="row" style={{ marginTop: 16 }}>
        {entry && (
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={status === 'paid' && !(Number(amount) > 0 && date)}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
