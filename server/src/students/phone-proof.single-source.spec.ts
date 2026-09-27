import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/**
 * Only an SMS code proves a student's phone (ADR-0039).
 *
 * A proved number is what spares the student the first-run SMS step, so
 * whatever writes it decides who is believed. Two paths may: the code the
 * student typed in the portal, and an SMS password reset — in both, a code
 * went to the card's number and came back.
 *
 * Telegram may NOT, by decision (CEO, 2026-09-27): neither a Telegram sign-in
 * (`phone_number_verified` in the OAuth id_token) nor a contact shared with
 * the bot. Telegram proves the number on the TELEGRAM ACCOUNT, and that can
 * differ from the number the student actually uses. Both look like a free
 * saving of one SMS, which is exactly why this guard exists.
 *
 * WHAT IT SEES: any `data` / `create` / `update` object that mentions
 * `verifiedPhone` or `phoneVerifiedAt` (nested writes through another model
 * included), raw SQL naming either column, and every call of
 * `markPhoneVerified`. WHAT IT DOES NOT: a write object built in a variable
 * and passed by name.
 */
const WRITER = {
  file: 'src/students/shared/mark-phone-verified.ts',
  why: 'the one write, conditional on the card still carrying the number',
};

const CALLERS: { file: string; why: string }[] = [
  {
    file: 'src/students/onboarding/student-onboarding.service.ts',
    why: 'the student typed the SMS code sent to the card number',
  },
  {
    file: 'src/auth/forgot-password/forgot-password.service.ts',
    why: 'an SMS password reset — its code reached the same number',
  },
];

const FIX =
  "Only an SMS code sent to the card's own number proves it (ADR-0039). A Telegram sign-in or a contact shared with the bot does NOT — the Telegram account's number can differ from the one the student uses. Go through markPhoneVerified, and add a caller here only for a new SMS path, with a behaviour test.";

const PROOF_FIELDS = new Set(['verifiedPhone', 'phoneVerifiedAt']);
const WRITE_KEYS = new Set(['data', 'create', 'update']);

function parse(fileName: string, source: string) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

/** Line numbers of write objects (`data` / `create` / `update`) that set a proof field. */
function proofWrites(fileName: string, source: string): number[] {
  const file = parse(fileName, source);
  const lines: number[] = [];

  const mentionsProof = (node: ts.Node): boolean =>
    ((ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)) &&
      PROOF_FIELDS.has(node.name.getText(file))) ||
    ts.forEachChild(node, mentionsProof) === true;

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      WRITE_KEYS.has(node.name.getText(file)) &&
      mentionsProof(node.initializer)
    ) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      return; // the outermost write object is the finding
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  // Raw SQL names the quoted column.
  source.split('\n').forEach((text, i) => {
    if (/"(verifiedPhone|phoneVerifiedAt)"/.test(text)) lines.push(i + 1);
  });
  return lines;
}

/** Line numbers of `markPhoneVerified(...)` calls. */
function markCalls(fileName: string, source: string): number[] {
  const file = parse(fileName, source);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'markPhoneVerified'
    ) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

const SRC = join(__dirname, '..');
const REPO = join(SRC, '..');

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

const rel = (f: string) => relative(REPO, f).split('\\').join('/');

describe('Only an SMS code proves a student phone (ADR-0039)', () => {
  it('sees direct, nested and raw writes, and ignores reads', () => {
    // If the detector missed these, the lists below would prove nothing.
    const sample = `
      async function f(tx, chatId, phone) {
        await tx.student.update({ where: { id: 1 }, data: { verifiedPhone: phone } });
        await tx.user.update({
          where: { id: 1 },
          data: { student: { update: { phoneVerifiedAt: new Date() } } },
        });
        await tx.$executeRaw\`UPDATE "Student" SET "verifiedPhone" = \${phone}\`;
        await tx.student.findFirst({ select: { verifiedPhone: true } });
        await tx.student.update({ where: { id: 1 }, data: { telegramChatId: chatId } });
        markPhoneVerified(tx, 1, phone);
      }`;
    expect(proofWrites('sample.ts', sample)).toEqual([3, 6, 8]);
    expect(markCalls('sample.ts', sample)).toEqual([11]);
  });

  it('only markPhoneVerified writes the proof', () => {
    const writers = walk(SRC)
      .filter((f) => proofWrites(f, readFileSync(f, 'utf8')).length > 0)
      .map(rel)
      .sort();

    expect({ writers, fix: FIX }).toEqual({ writers: [WRITER.file], fix: FIX });
  });

  it('only the SMS paths call markPhoneVerified — never a Telegram one', () => {
    const callers = walk(SRC)
      .filter((f) => markCalls(f, readFileSync(f, 'utf8')).length > 0)
      .map(rel)
      .sort();

    expect({ callers, fix: FIX }).toEqual({
      callers: CALLERS.map((c) => c.file).sort(),
      fix: FIX,
    });
  });
});
