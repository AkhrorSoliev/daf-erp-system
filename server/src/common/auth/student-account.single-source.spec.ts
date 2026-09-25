import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every student card is born with its sign-in account.
 *
 * Mock participant conversion wrote the card straight to the database and
 * nobody noticed that it opened no account: the student could not sign in
 * and the bot's "Parolni tiklash" had nothing to reset. The same thing had
 * already happened to lead records (see `student-origin.single-source.spec.ts`),
 * so this guard works the same way: every file that writes a Student row must
 * be listed here, and every listed file must open an account.
 *
 * WHAT IT DOES NOT CATCH: it checks that the call is in the file, not that it
 * runs. Each path's own behaviour test covers that
 * (`mock-exam-participants.convert-account.spec.ts`,
 * `student-registration-flow.spec.ts`, `students.service.spec.ts`).
 * It reads `src/` only; card creators in `scripts/` and `prisma/seed.ts` seed
 * dev data.
 */
const ALLOWED: { file: string; why: string }[] = [
  {
    file: 'src/students/students-write.service.ts',
    why: 'admin create — createStudentUser → openStudentAccount',
  },
  {
    file: 'src/telegram/scenes/student-registration-flow.ts',
    why: 'Telegram registration — openStudentAccount, the bot shows the password',
  },
  {
    file: 'src/mock-exams/mock-exam-participants.service.ts',
    why: 'mock participant conversion — openStudentAccount in the same transaction',
  },
];

const CREATES_STUDENT = /\.student\.(create|createMany|upsert)\(/;
// `openStudentAccount` is the one way to open a student account;
// `createStudentUser` is admin create's thin wrapper around it. A file that
// writes a Student-role account by hand does not count.
const OPENS_ACCOUNT = /openStudentAccount\(|createStudentUser\(/;

const FIX =
  'a new path that creates a student card must open its account with openStudentAccount (in the same transaction), have a behaviour test, and be added to ALLOWED';

const SRC = join(__dirname, '..', '..');
const REPO = join(SRC, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.endsWith('.spec.ts'));
const rel = (f: string) => relative(REPO, f).split('\\').join('/');

describe('A student card is never born without its sign-in account', () => {
  it('only the listed files create Student rows', () => {
    const creators = files
      .filter((f) => CREATES_STUDENT.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();

    expect({ creators, fix: FIX }).toEqual({
      creators: ALLOWED.map((a) => a.file).sort(),
      fix: FIX,
    });
  });

  it.each(ALLOWED)('$file opens the account — $why', ({ file }) => {
    const source = readFileSync(join(REPO, file), 'utf8');

    expect({ file, opensAccount: OPENS_ACCOUNT.test(source) }).toEqual({
      file,
      opensAccount: true,
    });
  });
});
