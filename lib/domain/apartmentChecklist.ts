/**
 * An apartment's own checklist: a list of items, shared by all its owners,
 * every one of which is a checkbox. Not to be confused with `checklist.ts`,
 * the app's own list of what to check before the declaration is filed.
 *
 * Owners only ever see items and plain lines. In the database the list is one
 * text, a line per item marked `- [ ]` or `- [x]`, which nobody types.
 */

export type ChecklistItem = { text: string; done: boolean };

/** How many items a checklist holds, and how long one may be: together they fit the column's 20 000 characters. */
export const CHECKLIST_ITEMS_MAX = 100;
export const CHECKLIST_ITEM_MAX = 190;

const MARKED = /^\s*(?:[-*]\s+)?\[([ xX])\]\s?(.*)$/;

/** The stored text: one line per item, marked with whether it is ticked. */
export function serializeChecklist(items: ChecklistItem[]): string {
  return items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
}

/** The items in the stored text. A line without a mark is an item not ticked; blank lines are none. */
export function parseChecklist(text: string): ChecklistItem[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const marked = MARKED.exec(line);
      return marked ? { text: marked[2]!.trim(), done: marked[1] !== ' ' } : { text: line.trim(), done: false };
    });
}
