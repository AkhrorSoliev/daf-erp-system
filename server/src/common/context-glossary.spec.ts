import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Keeps `CONTEXT.md` from rotting into a list of pointers to files that moved.
 *
 * The glossary's whole value is that each definition names the file where the
 * rule actually lives — read the entry, then read the code. A stale path breaks
 * that and, worse, does it silently: the reader concludes the concept is gone,
 * or goes looking somewhere else and reinvents it.
 *
 * This is not hypothetical. `CONTEXT.md` exists because the definitions
 * scattered through two 1000-line CLAUDE.md files had drifted from the code,
 * and one of them — "ABSENT is a no-op" — cost a real investigation before
 * anyone opened `lesson-billing.service.ts`. A guard is cheaper than the next
 * one of those.
 *
 * Only PATHS are checked, deliberately. Whether a definition is still TRUE is
 * a judgement no test can make; whether the file it points at exists is not.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const CONTEXT_PATH = join(REPO_ROOT, 'CONTEXT.md');

/** Backticked things that look like a path with a known extension. */
const PATH_IN_BACKTICKS = /`([A-Za-z0-9_./-]+\.(?:ts|tsx|md|prisma))`/g;

/** Where a bare path may be rooted — the glossary omits the workspace prefix. */
const SEARCH_ROOTS = ['', 'server/', 'server/src/', 'client/', 'client/src/'];

function resolveMention(mention: string): string | null {
  for (const root of SEARCH_ROOTS) {
    const candidate = join(REPO_ROOT, root + mention);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

describe('CONTEXT.md — the domain glossary', () => {
  it('exists at the repo root, where both workspaces can reach it', () => {
    expect(existsSync(CONTEXT_PATH)).toBe(true);
  });

  const source = existsSync(CONTEXT_PATH)
    ? readFileSync(CONTEXT_PATH, 'utf8')
    : '';
  const mentions = [
    ...new Set([...source.matchAll(PATH_IN_BACKTICKS)].map((m) => m[1])),
  ].sort();

  it('names enough files to be a map rather than an essay', () => {
    // A definition without a canonical file is an opinion. If this drops, the
    // glossary is drifting away from the code it is supposed to index.
    expect(mentions.length).toBeGreaterThan(30);
  });

  it('points only at files that exist', () => {
    const broken = mentions.filter((m) => resolveMention(m) === null);
    expect(broken).toEqual([]);
  });

  it('covers the areas where a wrong definition costs money', () => {
    // Not a style rule: every one of these has produced a real production
    // incident recorded in the docs, and each is a term someone must be able
    // to look up before touching the code.
    for (const term of [
      'ABSENT',
      'prepaidLessonsRemaining',
      'LESSON_CONSUMPTION',
      'gap sweep',
      'ReportBranchIds',
      'creditPeriodDate',
    ]) {
      expect(source).toContain(term);
    }
  });
});
