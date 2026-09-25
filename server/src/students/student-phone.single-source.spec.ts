import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/**
 * A card's phone changes in one place, and that place moves the sign-in
 * account with it (ADR-0032).
 *
 * The student's sign-in number lives on the account (`User.login` /
 * `User.phone`), the number staff see lives on the card (`Student.phone`).
 * They drifted because the one door that edited the card never touched the
 * account — 115 students in production on 2026-09-24. A second door written
 * the same way (a portal "change my number", a lead conversion refreshing an
 * existing student) would bring the drift straight back, and no behaviour test
 * of `StudentsWriteService` would notice. This does.
 *
 * WHAT IT DOES NOT SEE — honestly:
 * - a `data` object built in a variable and passed by name;
 * - a nested write through another model
 *   (`user.update({ data: { studentProfile: { update: { phone } } } })`);
 * - raw SQL (`src/` has no `UPDATE "Student"` today).
 * Creating a card is out of scope on purpose: the account is created from
 * the same number right after (`createStudentUser`), so nothing can drift.
 */
const ALLOWED: { file: string; why: string }[] = [
  {
    file: 'src/students/students-write.service.ts',
    why: 'PATCH /students/:id — moves the account through planPhoneChange',
  },
];

const FIX =
  'route the phone change through StudentsWriteService.update, or call planPhoneChange for the student account in the same transaction, write a behaviour test and add the file to ALLOWED';

const WRITE_METHODS = new Set(['update', 'updateMany', 'upsert']);

/** Line numbers of `<x>.student.update|updateMany|upsert(...)` calls that write `phone`. */
function studentPhoneWrites(fileName: string, source: string): number[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const lines: number[] = [];

  const mentionsPhone = (node: ts.Node): boolean =>
    ((ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)) &&
      node.name.getText(file) === 'phone') ||
    ts.forEachChild(node, mentionsPhone) === true;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      WRITE_METHODS.has(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === 'student'
    ) {
      const [arg] = node.arguments;
      const writes =
        arg !== undefined &&
        ts.isObjectLiteralExpression(arg) &&
        arg.properties.some(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ['data', 'update', 'create'].includes(p.name.getText(file)) &&
            mentionsPhone(p.initializer),
        );
      if (writes) {
        lines.push(
          file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        );
      }
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

describe("A card's phone changes in one place (ADR-0032)", () => {
  it('sees a phone written through a conditional spread', () => {
    // The shape `StudentsWriteService.update` itself uses — if the detector
    // missed it, the list below would be empty and prove nothing.
    const sample = `
      async function f(tx, dto) {
        await tx.student.update({
          where: { id: 1 },
          data: { ...(dto.phone !== undefined && { phone: dto.phone }) },
        });
        await this.prisma.student.updateMany({ where: {}, data: { phone } });
        await tx.student.update({ where: { id: 1 }, data: { firstName: 'A' } });
        await tx.user.update({ where: { id: 1 }, data: { phone: '1' } });
      }`;
    expect(studentPhoneWrites('sample.ts', sample)).toEqual([3, 7]);
  });

  it('only the allowed files write a phone onto an existing card', () => {
    const writers = walk(SRC)
      .filter((f) => studentPhoneWrites(f, readFileSync(f, 'utf8')).length > 0)
      .map(rel)
      .sort();

    expect({ writers, fix: FIX }).toEqual({
      writers: ALLOWED.map((a) => a.file).sort(),
      fix: FIX,
    });
  });

  it.each(ALLOWED)('$file moves the account too — $why', ({ file }) => {
    const source = readFileSync(join(REPO, file), 'utf8');
    expect({
      file,
      callsPlanPhoneChange: /planPhoneChange\(/.test(source),
    }).toEqual({
      file,
      callsPlanPhoneChange: true,
    });
  });
});
