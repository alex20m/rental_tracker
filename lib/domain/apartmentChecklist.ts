/**
 * An apartment's own checklist: free text, shared by all its owners, in which a
 * line written `- [ ] thing` (or `* [ ] thing`) is a task that can be ticked.
 * Not to be confused with `checklist.ts`, the app's own list of what to check
 * before the declaration is filed.
 *
 * The text is the whole truth. Ticking a task flips the brackets on its line
 * and nothing else, so what is saved is what the owner would have typed.
 */

/** The longest checklist that is stored; the same limit is a check on the column. */
export const CHECKLIST_MAX = 20_000;

export type ChecklistLine =
  /** `line`: the task's line in the text, which is how it is named when ticked. */
  | { kind: 'task'; line: number; done: boolean; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'text'; text: string };

const TASK = /^\s*[-*]\s+\[([ xX])\]\s+(\S.*)$/;
const BULLET = /^\s*[-*]\s+(\S.*)$/;
const LINE_BREAK = /\r?\n/;

/** What to show, line by line; blank lines are left out. */
export function parseChecklist(text: string): ChecklistLine[] {
  const lines: ChecklistLine[] = [];
  text.split(LINE_BREAK).forEach((raw, line) => {
    const task = TASK.exec(raw);
    const bullet = BULLET.exec(raw);
    if (task) lines.push({ kind: 'task', line, done: task[1] !== ' ', text: task[2]!.trim() });
    else if (bullet) lines.push({ kind: 'bullet', text: bullet[1]!.trim() });
    else if (raw.trim() !== '') lines.push({ kind: 'text', text: raw.trim() });
  });
  return lines;
}

/** How many of the tasks are ticked. */
export function progress(text: string): { done: number; total: number } {
  const tasks = parseChecklist(text).filter((l) => l.kind === 'task');
  return { done: tasks.filter((l) => l.done).length, total: tasks.length };
}

/** The text with the task on `line` ticked, or unticked if it was ticked. */
export function toggleTask(text: string, line: number): string {
  const lines = text.split(LINE_BREAK);
  lines[line] = lines[line]!.replace(/\[([ xX])\]/, (_, mark: string) => (mark === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

/** The text with a new, unticked task under everything that is there. */
export function addTask(text: string, item: string): string {
  const kept = text.replace(/\s+$/, '');
  return `${kept ? kept + '\n' : ''}- [ ] ${item}`;
}
