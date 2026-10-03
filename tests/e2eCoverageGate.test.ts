import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserModules, normalize, shortfalls } from '@/e2e/coverage';

/**
 * The end-to-end coverage gate runs after the browser suite, so nothing else
 * would notice if it stopped being able to fail. These prove it still does.
 */

const full = { pct: 100, covered: 4, total: 4 };
const file = (sourcePath: string, over: Partial<Record<'statements' | 'branches' | 'functions' | 'lines', typeof full>> = {}) => ({
  sourcePath,
  summary: { statements: full, branches: full, functions: full, lines: full, ...over },
});

describe('the end-to-end coverage gate', () => {
  it("finds every module marked 'use client', and nothing that runs only on the server", () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-'));
    const put = (path: string, text: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    put('components/Button.tsx', "'use client';\nexport const Button = () => null;\n");
    put('lib/client/fetcher.ts', '"use client"\nexport const x = 1;\n');
    put('app/page.tsx', 'export default function Page() { return null; }\n');
    put('app/api/thing/route.ts', 'export async function GET() {}\n');
    put('components/notes.md', "'use client'\n");

    expect(browserModules(root)).toEqual(['components/Button.tsx', 'lib/client/fetcher.ts']);
  });

  it('holds this app’s own client modules to it', () => {
    const modules = browserModules();

    expect(modules).toContain('components/RentalApp.tsx');
    expect(modules).toContain('components/SignIn.tsx');
    expect(modules).toContain('lib/client/declaration.ts');
    expect(modules).not.toContain('app/page.tsx');
    expect(modules).not.toContain('app/api/me/route.ts');
  });

  it('passes when every required file is fully covered', () => {
    expect(shortfalls([file('components/A.tsx'), file('lib/client/b.ts')], ['components/A.tsx', 'lib/client/b.ts'])).toEqual([]);
  });

  it('fails a file one branch short of 100 %', () => {
    const problems = shortfalls(
      [file('components/A.tsx', { branches: { pct: 99.5, covered: 199, total: 200 } })],
      ['components/A.tsx'],
    );

    expect(problems).toEqual(['components/A.tsx: branches 199/200']);
  });

  it('names the lines to cover', () => {
    const short = { pct: 50, covered: 2, total: 4 };
    const problems = shortfalls(
      [
        {
          ...file('components/A.tsx', { statements: short, lines: short }),
          data: { lines: { '3': 1, '4': 0, '5': 0, '9': 0, '12': '1/2' } },
        },
      ],
      ['components/A.tsx'],
    );

    expect(problems).toEqual(['components/A.tsx: statements 2/4, lines 2/4 — lines 4-5, 9; partly: 12']);
  });

  it('points at a branch never taken, even on a line that ran', () => {
    const problems = shortfalls(
      [
        {
          ...file('components/A.tsx', { branches: { pct: 50, covered: 1, total: 2 } }),
          source: 'const a = 1;\nconst b = x ? 1 : 2;\n',
          data: { lines: { '1': 1, '2': 1 }, branches: [{ start: 27, end: 28, count: 1 }, { start: 31, end: 32, count: 0 }] },
        },
      ],
      ['components/A.tsx'],
    );

    expect(problems).toEqual(['components/A.tsx: branches 1/2 — branch not taken at 2:19']);
  });

  it('fails a file no test ever loaded, instead of reading it as nothing to cover', () => {
    expect(shortfalls([file('components/A.tsx')], ['components/A.tsx', 'components/Never.tsx'])).toEqual([
      'components/Never.tsx: never loaded by any end-to-end test',
    ]);
  });

  it('reduces bundler source-map paths to repo-relative ones', () => {
    expect(normalize('turbopack:///[project]/components/RentalApp.tsx')).toBe('components/RentalApp.tsx');
    expect(normalize('webpack://_N_E/./lib/client/api.ts')).toBe('lib/client/api.ts');
    expect(normalize('components/ui.tsx')).toBe('components/ui.tsx');
  });
});
