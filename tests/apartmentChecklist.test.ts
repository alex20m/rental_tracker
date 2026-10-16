import { describe, expect, it } from 'vitest';
import { fromLines, parseChecklist, serializeChecklist, toLines } from '@/lib/domain/apartmentChecklist';

describe('storing the checklist', () => {
  it('reads back exactly the items it wrote, ticks included', () => {
    const items = [
      { text: 'Call the plumber', done: false },
      { text: 'Renew the insurance', done: true },
      { text: 'Fill in [x] the form', done: false },
    ];

    expect(parseChecklist(serializeChecklist(items))).toEqual(items);
  });

  it('stores nothing for no items, and reads nothing from it', () => {
    expect(serializeChecklist([])).toBe('');
    expect(parseChecklist('')).toEqual([]);
  });

  it('reads a line without a tick mark as an unticked item, and skips blank lines', () => {
    expect(parseChecklist('Spare keys in the drawer\n\n- [X] Done\r\n')).toEqual([
      { text: 'Spare keys in the drawer', done: false },
      { text: 'Done', done: true },
    ]);
  });
});

describe('editing the checklist as lines', () => {
  it('shows each item as one line of plain text, with no marks', () => {
    expect(toLines([{ text: 'One', done: true }, { text: 'Two', done: false }])).toBe('One\nTwo');
  });

  it('makes every non-blank line an item, trimmed', () => {
    expect(fromLines('  Call the plumber \n\n- Buy a smoke alarm', [])).toEqual([
      { text: 'Call the plumber', done: false },
      { text: '- Buy a smoke alarm', done: false },
    ]);
  });

  it('keeps the tick of an item whose text did not change, wherever it moved', () => {
    const before = [
      { text: 'Renew the insurance', done: true },
      { text: 'Call the plumber', done: false },
    ];

    expect(fromLines('New item\nCall the plumber\nRenew the insurance', before)).toEqual([
      { text: 'New item', done: false },
      { text: 'Call the plumber', done: false },
      { text: 'Renew the insurance', done: true },
    ]);
  });

  it('drops the tick of an item whose text was changed', () => {
    expect(fromLines('Renew the home insurance', [{ text: 'Renew the insurance', done: true }])).toEqual([
      { text: 'Renew the home insurance', done: false },
    ]);
  });

  it('gives one tick to one line when the same text was ticked once but now appears twice', () => {
    expect(fromLines('Check mail\nCheck mail', [{ text: 'Check mail', done: true }])).toEqual([
      { text: 'Check mail', done: true },
      { text: 'Check mail', done: false },
    ]);
  });
});
