import { useRef, useState } from 'react';
import type { CostCategory, CostEntry, DB } from '../types';
import { CATEGORIES } from '../types';
import { compressImage, deleteReceipt, saveReceipt, uid, update } from '../store';
import { eur } from '../tax';
import { Sheet, useReceipt } from '../ui';

const todayIso = () => new Date().toISOString().slice(0, 10);

function Thumb({ cost }: { cost: CostEntry }) {
  const src = useReceipt(cost.id, cost.hasReceipt);
  return src ? <img className="thumb" src={src} alt="Receipt" /> : <div className="thumb">{cost.hasReceipt ? '…' : 'no img'}</div>;
}

export default function Costs({ db, year }: { db: DB; year: number }) {
  const [editing, setEditing] = useState<CostEntry | 'new' | null>(null);
  const list = db.costs.filter((c) => c.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.filter((c) => CATEGORIES[c.category].deductible).reduce((a, c) => a + c.amount, 0);

  return (
    <>
      <div className="card">
        <div className="stat">
          <div className="v">{eur(total)}</div>
          <div className="l">
            Deductible costs in {year} · {list.length} entries
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
                <Thumb cost={c} />
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
      {editing && <CostForm cost={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CostForm({ cost, onClose }: { cost?: CostEntry; onClose: () => void }) {
  const [date, setDate] = useState(cost?.date ?? todayIso());
  const [category, setCategory] = useState<CostCategory>(cost?.category ?? 'maintenance_charge');
  const [description, setDescription] = useState(cost?.description ?? '');
  const [amount, setAmount] = useState(cost ? String(cost.amount) : '');
  const [newImage, setNewImage] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const existing = useReceipt(cost?.id ?? '', !!cost?.hasReceipt);
  const preview = removeImage ? undefined : (newImage ?? existing);

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      setNewImage(await compressImage(f));
      setRemoveImage(false);
    } catch {
      alert('Could not read that image.');
    }
    setBusy(false);
  };

  const save = async () => {
    const id = cost?.id ?? uid();
    const hasReceipt = !!preview;
    if (newImage) await saveReceipt(id, newImage);
    else if (removeImage) await deleteReceipt(id);
    const entry: CostEntry = { id, date, category, description: description.trim(), amount: Number(amount) || 0, hasReceipt };
    update((d) => ({ ...d, costs: [...d.costs.filter((c) => c.id !== id), entry] }));
    onClose();
  };

  const remove = async () => {
    if (!cost) return;
    await deleteReceipt(cost.id);
    update((d) => ({ ...d, costs: d.costs.filter((c) => c.id !== cost.id) }));
    onClose();
  };

  const cat = CATEGORIES[category];

  return (
    <Sheet onClose={onClose}>
      <h3>{cost ? 'Edit cost' : 'Add cost'}</h3>
      <div className="row">
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Amount (€)</label>
          <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <label>Category</label>
      <select value={category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
        {(Object.keys(CATEGORIES) as CostCategory[]).map((k) => (
          <option key={k} value={k}>
            {CATEGORIES[k].label} ({CATEGORIES[k].fi})
          </option>
        ))}
      </select>
      {cat.hint && <div className="note" style={{ marginTop: 6 }}>{cat.hint}</div>}
      <label>Description</label>
      <input value={description} placeholder="e.g. Kitchen tap replacement" onChange={(e) => setDescription(e.target.value)} />

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
      {preview && <img className="receipt-img" src={preview} alt="Receipt preview" />}

      <div className="row" style={{ marginTop: 16 }}>
        {cost && (
          <button className="btn danger" onClick={remove}>
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
