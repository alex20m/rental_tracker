import { describe, expect, it } from 'vitest';
import { parseChecklist, serializeChecklist } from '@/lib/domain/apartmentChecklist';

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
