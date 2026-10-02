import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/**
 * The pipeline's shape is behaviour, so it is asserted rather than eyeballed.
 *
 * In a repo where nothing is reviewed by a human, dropping `npm test` from the
 * checks, or adding a deploy job that races the platform's own, produces a
 * pipeline that is green and worthless — and no other test notices, because
 * every other test runs *inside* the job that was bypassed.
 *
 * Keep these when you build on the skeleton. Each one has a one-line edit that
 * turns it red; that is the point.
 */

type Step = { name?: string; run?: string; if?: string };
type Job = { steps?: Step[] };
type Workflow = {
  on?: Record<string, { branches?: string[] } | null>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
};

const PULL_REQUEST = 'pull-request.yml';
const MAIN = 'main.yml';

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
}

const sources: Record<string, string> = {
  [PULL_REQUEST]: read(`.github/workflows/${PULL_REQUEST}`),
  [MAIN]: read(`.github/workflows/${MAIN}`),
};

const workflows: Record<string, Workflow> = Object.fromEntries(
  Object.entries(sources).map(([file, text]) => [file, parse(text) as Workflow]),
);

/** Fails loudly on a renamed file rather than quietly asserting about nothing. */
function workflowOf(file: string): Workflow {
  const workflow = workflows[file];
  if (workflow === undefined) {
    throw new Error(`no workflow "${file}" (found: ${Object.keys(workflows).join(', ')})`);
  }
  return workflow;
}

function commandsOf(workflow: Workflow, jobId: string): string {
  return (workflow.jobs[jobId]?.steps ?? []).map((step) => step.run ?? '').join('\n');
}

/** Jobs that would push a build to the platform, found by what they run. */
function deployingJobIds(workflow: Workflow): string[] {
  return Object.keys(workflow.jobs).filter((id) =>
    /\bvercel(?:@\S+)?\s+(?:deploy|build)\b/.test(commandsOf(workflow, id)),
  );
}

/** Jobs that would apply schema migrations. */
function migratingJobIds(workflow: Workflow): string[] {
  return Object.keys(workflow.jobs).filter((id) =>
    /\b(?:npm run migrate|node-pg-migrate|supabase db push)\b/.test(commandsOf(workflow, id)),
  );
}

describe('workflow triggers', () => {
  it('runs the pull-request workflow only on pull requests', () => {
    // Parsed under YAML 1.2, so `on:` stays a string rather than collapsing to
    // the boolean `true` that YAML 1.1 would give.
    expect(Object.keys(workflowOf(PULL_REQUEST).on ?? {})).toEqual(['pull_request']);
  });

  it('runs the main workflow only on pushes to main and on demand', () => {
    const triggers = workflowOf(MAIN).on ?? {};
    expect(Object.keys(triggers).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(triggers.push?.branches).toEqual(['main']);
  });

  it('grants both workflows read-only access by default', () => {
    for (const [file, workflow] of Object.entries(workflows)) {
      expect(workflow.permissions, `${file} must be read-only by default`).toEqual({
        contents: 'read',
      });
    }
  });
});

describe('the checks', () => {
  it('install from the lockfile rather than resolving fresh versions', () => {
    for (const [file, workflow] of Object.entries(workflows)) {
      const commands = commandsOf(workflow, 'verify');
      expect(commands, `${file} must install from the lockfile`).toContain('npm ci');
      expect(commands, `${file} must not resolve fresh versions`).not.toMatch(/npm install\b/);
    }
  });

  it('lint, typecheck, test and build in both workflows', () => {
    // A pull request and the merge of that same pull request are held to
    // identical checks.
    for (const [file, workflow] of Object.entries(workflows)) {
      const commands = commandsOf(workflow, 'verify');
      expect(commands, `${file} must lint`).toContain('npm run lint');
      expect(commands, `${file} must typecheck`).toContain('npm run typecheck');
      expect(commands, `${file} must test`).toContain('npm test');
      expect(commands, `${file} must build`).toContain('npm run build');
    }
  });

  it('report every failing check in one run instead of stopping at the first', () => {
    for (const [file, workflow] of Object.entries(workflows)) {
      const checks = (workflow.jobs.verify?.steps ?? []).filter((step) =>
        /npm (?:test|run (?:lint|typecheck|build))/.test(step.run ?? ''),
      );
      expect(checks.length, `${file} must run four checks`).toBeGreaterThanOrEqual(4);
      for (const step of checks) {
        expect(step.if, `${file}: "${step.name}" must run after an earlier failure`).toBe(
          '${{ !cancelled() }}',
        );
      }
    }
  });
});

describe('deploying and migrating', () => {
  it('recognises jobs that deploy or migrate', () => {
    // The two assertions below match nothing by design, so they would pass
    // vacuously if the detectors broke — a regex for `vercel deploy` does not
    // match `npx vercel@latest deploy`. This proves they still fire.
    const fixture = parse(
      [
        'jobs:',
        '  ship:',
        '    steps:',
        '      - run: npx --yes vercel@latest deploy --prebuilt --prod',
        '  schema:',
        '    steps:',
        '      - run: npm run migrate',
        '  checks:',
        '    steps:',
        '      - run: npm test',
      ].join('\n'),
    ) as Workflow;

    expect(deployingJobIds(fixture)).toEqual(['ship']);
    expect(migratingJobIds(fixture)).toEqual(['schema']);
  });

  it('leaves deploying to the platform', () => {
    // Two routes to production means every merge deploys twice, racing itself,
    // and a rollback on one side is silently undone by the other.
    for (const [file, workflow] of Object.entries(workflows)) {
      expect(deployingJobIds(workflow), `${file} must not deploy`).toEqual([]);
    }
  });

  it('leaves migrating to the build', () => {
    // A workflow and the deploy both start from the same push, so nothing
    // orders them; inside the build the ordering is a dependency.
    for (const [file, workflow] of Object.entries(workflows)) {
      expect(migratingJobIds(workflow), `${file} must not migrate`).toEqual([]);
    }
  });

  it('keeps platform credentials out of the workflows entirely', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, `${file} must not reference deploy credentials`).not.toMatch(
        /VERCEL_(?:TOKEN|ORG_ID|PROJECT_ID)/,
      );
    }
  });

  it('migrates in the build command, before anything is served', () => {
    // The ordering guarantee. The platform promotes a deployment only if its
    // build exited 0, so the schema is in place before the new code takes a
    // request — and a failed migration leaves the previous deployment serving.
    const config = JSON.parse(read('vercel.json')) as { buildCommand?: string };

    // `&&` and not `;`: with a semicolon the build proceeds over a failed
    // migration, which is the exact failure this arrangement prevents.
    expect(config.buildCommand).toMatch(/npm run migrate\s*&&\s*(?:npm run build|next build)/);
  });

  it('keeps the migration out of `npm run build`', () => {
    // The checks run `npm run build` and have no database. A migrate folded
    // into that script would make CI need one, and would migrate from a
    // developer's laptop on every local build.
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    expect(pkg.scripts.build).not.toMatch(/migrate/);
    expect(pkg.scripts.migrate, 'the build command above invokes this').toBeDefined();
  });
});
