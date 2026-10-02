'use client';

import { useRef, useState } from 'react';
import type { ApartmentView, CostCategory, CostEntry } from '@/lib/domain/types';
import { CATEGORIES, COST_CATEGORIES } from '@/lib/domain/types';
import { api, compressImage } from '@/lib/client/api';
import { eur } from '@/lib/domain/tax';
import { ErrorNote, Sheet } from '@/components/ui';

const todayIso = () => new Date().toISOString().slice(0, 10);

type Props = { apt: ApartmentView; year: number; onChanged: () => Promise<void> };

function Thumb({ apt, cost }: { apt: ApartmentView; cost: CostEntry }) {
  return cost.hasReceipt ? (
    // eslint-disable-next-line @next/next/no-img-element -- a private, per-user image; not for the image optimizer
    <img className="thumb" src={api.receiptUrl(apt.id, cost.id)} alt="Receipt" loading="lazy" />
  ) : (
    <div className="thumb">no img</div>
  );
}

export default function Costs({ apt, year, onChanged }: Props) {
  const [editing, setEditing] = useState<CostEntry | 'new' | null>(null);
  const list = apt.costs.filter((c) => c.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.filter((c) => CATEGORIES[c.category].deductible).reduce((a, c) => a + c.amount, 0);

  return (
    <>
      <div className="card">
        <div className="stat">
          <div className="v">{eur(total)}</div>
          <div className="l">
            Deductible costs in {year} · {list.length} entries
            {apt.owners.length > 1 && ' · whole apartment'}
          </div>
        </div>
      </div>
      <div className="card">
        {list.length === 0 ? (
          <div className="empty">No costs for {year}. Add repairs, maintenance charges, insurance, loan interest…</div>
        ) : (
          <ul className="list">
            {list.map((c) => (
              <li key={c.id} onClick={() => setEditing(c)}>
                <Thumb apt={apt} cost={c} />
                <div className="main">
                  <div className="t">{c.description || CATEGORIES[c.category].label}</div>
                  <div className="s">
                    {c.date} · {CATEGORIES[c.category].label}
                    {!CATEGORIES[c.category].deductible && ' · not deductible'}
                  </div>
                </div>
                <div style={{ fontWeight: 600 }}>{eur(c.amount)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn primary fab" onClick={() => setEditing('new')}>
        + Add cost
      </button>
      {editing && (
        <CostForm apt={apt} cost={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onChanged={onChanged} />
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
      setError('Could not read that image.');
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
      const id = cost ? (await api.updateCost(apt.id, cost.id, entry), cost.id) : (await api.createCost(apt.id, entry)).id;
      if (newImage) await api.putReceipt(apt.id, id, newImage);
      else if (removeImage && cost?.hasReceipt) await api.deleteReceipt(apt.id, id);
    });

  const remove = () => run(() => api.deleteCost(apt.id, cost!.id));

  const cat = CATEGORIES[category];

  return (
    <Sheet onClose={onClose}>
      <h3>{cost ? 'Edit cost' : 'Add cost'}</h3>
      <div className="row">
        <div>
          <label htmlFor="cost-date">Date</label>
          <input id="cost-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cost-amount">Amount (€)</label>
          <input
            id="cost-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      <label htmlFor="cost-category">Category</label>
      <select id="cost-category" value={category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
        {COST_CATEGORIES.map((k) => (
          <option key={k} value={k}>
            {CATEGORIES[k].label} ({CATEGORIES[k].fi})
          </option>
        ))}
      </select>
      {cat.hint && (
        <div className="note" style={{ marginTop: 6 }}>
          {cat.hint}
        </div>
      )}
      <label htmlFor="cost-description">Description</label>
      <input
        id="cost-description"
        value={description}
        placeholder="e.g. Kitchen tap replacement"
        onChange={(e) => setDescription(e.target.value)}
      />

      <label>Receipt</label>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="row">
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Processing…' : preview ? 'Replace photo' : 'Take / choose photo'}
        </button>
        {preview && (
          <button
            className="btn danger"
            onClick={() => {
              setNewImage(undefined);
              setRemoveImage(true);
            }}
          >
            Remove photo
          </button>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or a private, per-user image */}
      {preview && <img className="receipt-img" src={preview} alt="Receipt preview" />}

      <ErrorNote message={error} />
      <div className="row" style={{ marginTop: 16 }}>
        {cost && (
          <button className="btn danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={!(Number(amount) > 0 && date) || busy}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
