'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { fromLines, toLines, type ChecklistItem } from '@/lib/domain/apartmentChecklist';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading } from '@/components/ui';

type Props = { apt: ApartmentView; onChanged: () => Promise<void> };

/**
 * The apartment's checklist, shared by all its owners: every item a checkbox.
 * An item is added from the box under the list; Edit turns the list into plain
 * lines, one item each, to reword, reorder or remove them all at once. Every
 * change saves the whole list, which is what the other owners then see.
 */
export default function Checklist({ apt, onChanged }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [item, setItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const items = apt.checklist;
  const total = items.length;
  const done = items.filter((i) => i.done).length;

  /** Saves `next`; false, with the reason shown, if it could not be. */
  const save = async (next: ChecklistItem[]) => {
    setBusy(true);
    setError('');
    try {
      await api.setChecklist(apt.id, next);
      await onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (await save([...items, { text: item.trim(), done: false }])) setItem('');
  };

  const startEditing = () => {
    setDraft(toLines(items));
    setError('');
    setEditing(true);
  };

  const saveDraft = async () => {
    if (await save(fromLines(draft, items))) setEditing(false);
  };

  return (
    <section className="section">
      <Heading action={total > 0 ? <span className="chip">{t('checklist.progress', { done, total })}</span> : undefined}>
        {t('nav.checklist')}
      </Heading>
      <p className="checklist-hint">{t('checklist.shared')}</p>
      <div className="card pad">
        {editing ? (
          <>
            <label htmlFor="checklist-text">{t('checklist.editLabel')}</label>
            <textarea
              id="checklist-text"
              rows={12}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="checklist-hint">{t('checklist.hint')}</p>
            <ErrorNote message={error} />
            <div className="form-foot">
              <button className="btn small" disabled={busy} onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary small" disabled={busy} onClick={saveDraft}>
                {t('common.save')}
              </button>
            </div>
          </>
        ) : (
          <>
            {total === 0 ? (
              <p className="checklist-hint">{t('checklist.empty')}</p>
            ) : (
              <ul className="checklist" aria-label={t('checklist.items')}>
                {items.map((it, i) => (
                  <li key={i}>
                    <label>
                      <input
                        type="checkbox"
                        checked={it.done}
                        disabled={busy}
                        onChange={() => save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                      />
                      <span>{it.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <form className="checklist-add" onSubmit={addItem}>
              <input
                aria-label={t('checklist.newItem')}
                placeholder={t('checklist.newItem')}
                value={item}
                onChange={(e) => setItem(e.target.value)}
              />
              <button className="btn quiet" type="submit" disabled={busy || item.trim() === ''}>
                {t('checklist.add')}
              </button>
            </form>
            <ErrorNote message={error} />
            <div className="form-foot">
              <button className="btn small" disabled={busy} onClick={startEditing}>
                {t('checklist.edit')}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
