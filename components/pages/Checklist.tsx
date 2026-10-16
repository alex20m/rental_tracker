'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import type { ChecklistItem } from '@/lib/domain/apartmentChecklist';
import { api } from '@/lib/client/api';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading, Icon } from '@/components/ui';

type Props = { apt: ApartmentView; onChanged: () => Promise<void> };

/**
 * The apartment's checklist, shared by all its owners: one row per item, a
 * checkbox, its text and a × to remove it. An item is added from the box under
 * the list, which stays focused so the next one can be typed straight away.
 *
 * Every change is shown at once and saved as the whole list, which is what the
 * other owners then see. Saves run in turn, so items typed in quick succession
 * are all kept; if one fails, it and the changes after it are dropped, the
 * list goes back to what was saved and the reason is shown.
 */
export default function Checklist({ apt, onChanged }: Props) {
  const { t } = useI18n();
  const [item, setItem] = useState('');
  // The list as changed but not all saved yet; null once every change is saved and reloaded.
  const [shown, setShown] = useState<ChecklistItem[] | null>(null);
  const [error, setError] = useState('');
  const latest = useRef<ChecklistItem[] | null>(null);
  // Saves run one after another, each sending the list as it was when it was made.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);
  // Bumped when a save fails, so the changes queued behind it are dropped with it.
  const round = useRef(0);

  const items = shown ?? apt.checklist;
  const done = items.filter((i) => i.done).length;

  /** Shows the change at once and queues its save; resolves to whether it was saved. */
  const change = (edit: (list: ChecklistItem[]) => ChecklistItem[]): Promise<boolean> => {
    const next = edit(latest.current ?? apt.checklist);
    latest.current = next;
    setShown(next);
    setError('');
    const mine = round.current;
    waiting.current += 1;
    const saved = queue.current.then(async () => {
      let ok = false;
      if (mine === round.current) {
        try {
          await api.setChecklist(apt.id, next);
          ok = true;
        } catch (e) {
          setError((e as Error).message);
          round.current += 1;
        }
      }
      waiting.current -= 1;
      if (waiting.current === 0) {
        await onChanged();
        // A change made while reloading is still to be saved, so keep showing it over the reloaded list.
        if (waiting.current === 0) {
          latest.current = null;
          setShown(null);
        }
      }
      return ok;
    });
    queue.current = saved;
    return saved;
  };

  /** Clears the box at once, so the next item can be typed while this one saves; puts the text back if it was not saved. */
  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    const text = item.trim();
    setItem('');
    if (!(await change((list) => [...list, { text, done: false }]))) setItem((now) => now || text);
  };

  return (
    <section className="section">
      <Heading
        action={items.length > 0 ? <span className="chip">{t('checklist.progress', { done, total: items.length })}</span> : undefined}
      >
        {t('nav.checklist')}
      </Heading>
      <p className="checklist-hint">{t('checklist.shared')}</p>
      <div className="card pad">
        {items.length === 0 ? (
          <p className="checklist-hint">{t('checklist.empty')}</p>
        ) : (
          <ul className="checklist" aria-label={t('checklist.items')}>
            {items.map((it, i) => (
              <li key={i}>
                <label>
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={() => change((list) => list.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                  />
                  <span>{it.text}</span>
                </label>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={t('checklist.remove', { item: it.text })}
                  onClick={() => change((list) => list.filter((_, j) => j !== i))}
                >
                  {Icon.close}
                </button>
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
          <button className="btn quiet" type="submit" disabled={item.trim() === ''}>
            {t('checklist.add')}
          </button>
        </form>
        <ErrorNote message={error} />
      </div>
    </section>
  );
}
