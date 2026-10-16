'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ApartmentView } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { addTask, CHECKLIST_MAX, parseChecklist, progress, toggleTask } from '@/lib/domain/apartmentChecklist';
import { useI18n } from '@/components/I18nProvider';
import { ErrorNote, Heading } from '@/components/ui';

type Props = { apt: ApartmentView; onChanged: () => Promise<void> };

/**
 * The apartment's checklist: one text shared by all its owners, in which a line
 * written `- [ ] thing` is a task to tick. It is read as a list; a task is
 * added from the box under it, and the text itself is edited in one textarea,
 * so a bullet or a plain note is just a line written that way. Every change
 * saves the whole text, which is what the other owners then read.
 */
export default function Checklist({ apt, onChanged }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [item, setItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lines = parseChecklist(apt.checklist);
  const { done, total } = progress(apt.checklist);

  /** Saves `text`; false, with the reason shown, if it could not be. */
  const save = async (text: string) => {
    setBusy(true);
    setError('');
    try {
      await api.setChecklist(apt.id, text);
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
    if (await save(addTask(apt.checklist, item.trim()))) setItem('');
  };

  const startEditing = () => {
    setDraft(apt.checklist);
    setError('');
    setEditing(true);
  };

  const saveDraft = async () => {
    if (await save(draft)) setEditing(false);
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
              maxLength={CHECKLIST_MAX}
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
            {lines.length === 0 ? (
              <p className="checklist-hint">{t('checklist.empty')}</p>
            ) : (
              <ul className="checklist" aria-label={t('checklist.items')}>
                {lines.map((l, i) => (
                  <li key={i} className={l.kind === 'task' ? 'task' + (l.done ? ' ticked' : '') : l.kind}>
                    {l.kind === 'task' ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={l.done}
                          disabled={busy}
                          onChange={() => save(toggleTask(apt.checklist, l.line))}
                        />
                        <span>{l.text}</span>
                      </label>
                    ) : (
                      l.text
                    )}
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
