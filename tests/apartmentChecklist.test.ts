import { describe, expect, it } from 'vitest';
import { addTask, parseChecklist, progress, toggleTask } from '@/lib/domain/apartmentChecklist';

const TEXT = ['Keys: spare set in the drawer', '', '- [ ] Call the plumber', '- [x] Renew the insurance', '* [X] Bleed radiators', '- Water meter is in the hall', '- [ ]'].join('\n');

describe('reading the checklist text', () => {
  it('turns "- [ ]" and "- [x]" lines into tasks, remembering which line each one is', () => {
    expect(parseChecklist(TEXT).filter((l) => l.kind === 'task')).toEqual([
      { kind: 'task', line: 2, done: false, text: 'Call the plumber' },
      { kind: 'task', line: 3, done: true, text: 'Renew the insurance' },
      { kind: 'task', line: 4, done: true, text: 'Bleed radiators' },
    ]);
  });

  it('shows plain "-" lines as bullets and everything else as text, and skips blank lines', () => {
    expect(parseChecklist(TEXT).filter((l) => l.kind !== 'task')).toEqual([
      { kind: 'text', text: 'Keys: spare set in the drawer' },
      { kind: 'bullet', text: 'Water meter is in the hall' },
      { kind: 'bullet', text: '[ ]' },
    ]);
  });

  it('reads Windows line endings the same as Unix ones', () => {
    expect(parseChecklist('- [x] Done\r\n- [ ] Not yet\r\n')).toEqual([
      { kind: 'task', line: 0, done: true, text: 'Done' },
      { kind: 'task', line: 1, done: false, text: 'Not yet' },
    ]);
  });

  it('reads nothing from an empty checklist', () => {
    expect(parseChecklist('')).toEqual([]);
  });
});

describe('progress', () => {
  it('counts the tasks ticked and the tasks in all, not bullets or text', () => {
    expect(progress(TEXT)).toEqual({ done: 2, total: 3 });
  });

  it('is zero of zero when there are no tasks', () => {
    expect(progress('Just a note\n- a bullet')).toEqual({ done: 0, total: 0 });
  });
});

describe('ticking a task', () => {
  it('ticks the task on that line and changes nothing else', () => {
    expect(toggleTask('- [ ] One\n- [ ] Two\nnote', 1)).toBe('- [ ] One\n- [x] Two\nnote');
  });

  it('unticks a ticked task, whichever way the x was written', () => {
    expect(toggleTask('- [x] One\n* [X] Two', 0)).toBe('- [ ] One\n* [X] Two');
    expect(toggleTask('- [x] One\n* [X] Two', 1)).toBe('- [x] One\n* [ ] Two');
  });

  it('leaves a "[ ]" later in the line alone', () => {
    expect(toggleTask('- [ ] Fill in [ ] the form', 0)).toBe('- [x] Fill in [ ] the form');
  });
});

describe('adding a task', () => {
  it('starts the checklist when it is empty', () => {
    expect(addTask('', 'Buy a smoke alarm')).toBe('- [ ] Buy a smoke alarm');
  });

  it('adds under what is there, on a line of its own, however the text ended', () => {
    expect(addTask('Note', 'Two')).toBe('Note\n- [ ] Two');
    expect(addTask('- [ ] One\n\n', 'Two')).toBe('- [ ] One\n- [ ] Two');
  });
});
