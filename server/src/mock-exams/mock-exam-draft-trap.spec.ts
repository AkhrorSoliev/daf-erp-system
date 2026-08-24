import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { MOCK_EXAM_STATUS_TRANSITIONS } from './mock-exam-status.util';

/**
 * `MockExam.status` defaults to `DRAFT` in the schema, and `DRAFT` has NO
 * outgoing transitions. A row that lands there can never move again: it cannot
 * open registration, cannot be graded, cannot even be archived. It is a
 * one-way door with the database holding it open.
 *
 * Nothing walks through it today — every create sets the status explicitly and
 * production holds zero DRAFT rows. That is exactly the shape of a trap that
 * has not sprung yet: the next `mockExam.create` written without a `status`
 * inherits the default, and the exam is stuck with no error to explain it.
 *
 * The enum value stays (dropping a Postgres enum member is an irreversible
 * migration) and the default stays with it. So the guard is here instead:
 * every create must name a status.
 */

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Where a mock exam is created. Brace matching is deliberately avoided — the
 * `data` block is long and a regex that tries to find its closing brace
 * silently matches NOTHING when it guesses the length wrong, which is a guard
 * that reports success while checking zero files. The window below is read
 * from the call site forward; the `status` key is near the top of every such
 * block.
 */
const CREATE_MARKER = '.mockExam.create(';
const WINDOW = 1200;

describe('MockExam DRAFT is a one-way door', () => {
  it('has no way out, which is why the rest of this file exists', () => {
    expect(MOCK_EXAM_STATUS_TRANSITIONS.DRAFT).toEqual([]);
  });

  const creates = walk(SRC).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const rel =
      'src/' +
      file
        .slice(SRC.length + 1)
        .split('\\')
        .join('/');
    const found: { file: string; text: string }[] = [];
    let at = source.indexOf(CREATE_MARKER);
    while (at !== -1) {
      found.push({ file: rel, text: source.slice(at, at + WINDOW) });
      at = source.indexOf(CREATE_MARKER, at + CREATE_MARKER.length);
    }
    return found;
  });

  it('finds the create calls at all — a silent zero proves nothing', () => {
    expect(creates.length).toBeGreaterThan(0);
  });

  it('every create names a status rather than inheriting the default', () => {
    const silent = creates
      .filter((c) => !/\bstatus\s*:/.test(c.text))
      .map((c) => c.file);

    expect(silent).toEqual([]);
  });

  it('and none of them names DRAFT', () => {
    const drafts = creates
      .filter((c) => /status\s*:\s*(MockExamStatus\.)?DRAFT/.test(c.text))
      .map((c) => c.file);

    expect(drafts).toEqual([]);
  });
});
