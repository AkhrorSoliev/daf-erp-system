import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every write of `User.password` on an existing account must end that
 * account's other sessions (ADR-0030). `passwordWrite()` in
 * `common/auth/session-version.ts` is the one way to write the column that
 * does, because it puts the hash and the session-version bump in ONE update.
 *
 * This guard reads every source file as a TypeScript AST and fails on any
 * other place that WRITES a `password` key: an object-literal property
 * (`password: hash`, shorthand `{ password }`) or an assignment
 * (`x.password = …`). Not writes, and ignored: a Prisma `select`/`omit` flag
 * (`password: true`), a type, a parameter, a destructuring pattern. An object
 * passed to a `create`/`createMany` call — or the `create` half of an
 * `upsert` — is allowed: a new account has no sessions to end.
 *
 * What it does not catch, honestly:
 * - raw SQL (`$executeRaw`) — nothing writes `"User"."password"` that way today;
 * - a computed key (`{ [key]: hash }`).
 * The behaviour tests beside each path (`*-password-sessions.spec.ts`,
 * `portal-password-reset.service.spec.ts`, `password-reset-flow.spec.ts`)
 * check the bump really happens; this guard checks nobody goes around it.
 */

/** The only file allowed to write the key: it IS `passwordWrite()`. */
const THE_SOURCE = 'src/common/auth/session-version.ts';

/**
 * `password` keys that are not `User.password`. `where` is the call the key
 * sits in, or the assignment target — narrower than a whole file, so a real
 * user write added to one of these files later still fails.
 */
const NOT_A_USER_PASSWORD: { file: string; where: string; why: string }[] = [
  {
    file: 'src/redis/redis.service.ts',
    where: 'super',
    why: 'Redis connection option',
  },
  {
    file: 'src/eskiz/eskiz.service.ts',
    where: 'this.password',
    why: 'Eskiz SMS API credential',
  },
  {
    file: 'src/users/users.controller.ts',
    where: 'JSON.stringify',
    why: "a log line that masks the DTO's password",
  },
  {
    file: 'src/telegram/scenes/employee-registration.scene.ts',
    where: 'buildStaffCredentialsMessage',
    why: 'the welcome message for the account just created',
  },
];

const FIX =
  'write the column with passwordWrite() from common/auth/session-version.ts and call recordSessionsEnded() after the commit — see ADR-0030';

interface PasswordWrite {
  file: string;
  line: number;
  /** The call the key sits in, or the assignment target. */
  where: string;
}

const CREATES = new Set(['create', 'createMany']);

function keyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined;
}

/** The nearest call that receives `node` (or something containing it) as an argument. */
function enclosingCall(node: ts.Node): ts.CallExpression | undefined {
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.some((arg) => arg === current)
    ) {
      return parent;
    }
    current = parent;
  }
  return undefined;
}

/** Which top-level key of an `upsert` argument holds `node`. */
function upsertBranch(
  node: ts.Node,
  call: ts.CallExpression,
): string | undefined {
  const arg = call.arguments[0];
  let current: ts.Node = node;
  while (current.parent && current.parent !== arg) current = current.parent;
  return current.parent === arg && ts.isPropertyAssignment(current)
    ? keyName(current.name)
    : undefined;
}

function writesNewRow(node: ts.Node): boolean {
  const call = enclosingCall(node);
  if (!call || !ts.isPropertyAccessExpression(call.expression)) return false;
  const method = call.expression.name.text;
  if (CREATES.has(method)) return true;
  return method === 'upsert' && upsertBranch(node, call) === 'create';
}

function findPasswordWrites(source: string, file: string): PasswordWrite[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: PasswordWrite[] = [];
  const lineOf = (node: ts.Node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      keyName(node.name) === 'password' &&
      ts.isObjectLiteralExpression(node.parent)
    ) {
      const isFlag =
        ts.isPropertyAssignment(node) &&
        (node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
          node.initializer.kind === ts.SyntaxKind.FalseKeyword);
      if (!isFlag && !writesNewRow(node)) {
        const call = enclosingCall(node);
        found.push({
          file,
          line: lineOf(node),
          where: call ? call.expression.getText(sf) : '(no call)',
        });
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ((ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === 'password') ||
        (ts.isElementAccessExpression(node.left) &&
          ts.isStringLiteral(node.left.argumentExpression) &&
          node.left.argumentExpression.text === 'password'))
    ) {
      found.push({ file, line: lineOf(node), where: node.left.getText(sf) });
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('findPasswordWrites — the detector', () => {
  const where = (src: string) =>
    findPasswordWrites(src, 'fixture.ts').map((w) => w.where);

  it('flags a raw password in a user update', () => {
    expect(
      where(`tx.user.update({ where: { id }, data: { password: hash } });`),
    ).toEqual(['tx.user.update']);
  });

  it('flags a password hidden in a conditional spread', () => {
    expect(
      where(`prisma.user.update({ data: { ...(h && { password: h }) } });`),
    ).toEqual(['prisma.user.update']);
  });

  it('flags an assignment into a data object, dotted or bracketed', () => {
    expect(
      where(`updateData.password = h; updateData['password'] = null;`),
    ).toEqual(['updateData.password', "updateData['password']"]);
  });

  it('flags Object.assign with a raw password', () => {
    expect(where(`Object.assign(updateData, { password: null });`)).toEqual([
      'Object.assign',
    ]);
  });

  it('lets passwordWrite() through', () => {
    expect(
      where(
        `tx.user.update({ data: { ...passwordWrite(h) } }); prisma.user.update({ data: passwordWrite(null) });`,
      ),
    ).toEqual([]);
  });

  it('lets a new account through', () => {
    expect(
      where(
        `prisma.user.create({ data: { password: h } }); usersService.create({ login, password });`,
      ),
    ).toEqual([]);
  });

  it('judges an upsert by branch', () => {
    expect(
      where(
        `prisma.user.upsert({ where: { id }, create: { password: h }, update: { password: h } });`,
      ),
    ).toEqual(['prisma.user.upsert']);
  });

  it('ignores selects, types, parameters and destructuring', () => {
    expect(
      where(`
        prisma.user.findUnique({ select: { password: true } });
        interface Dto { password: string }
        function f(login: string, password: string) { return login + password; }
        const { password: _, ...rest } = user;
      `),
    ).toEqual([]);
  });
});

const SRC = join(__dirname, '..', '..');
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

const files = walk(SRC);
const rel = (f: string) => relative(REPO, f).split('\\').join('/');
const writes = files.flatMap((f) =>
  findPasswordWrites(readFileSync(f, 'utf8'), rel(f)),
);

describe('User.password is written only through passwordWrite() — single source', () => {
  it('reads the source tree at all (a silent zero would pass everything)', () => {
    expect(files.length).toBeGreaterThan(500);
    // Creates, the Redis option, Eskiz, the log mask and the welcome messages
    // are all still in there: a scanner that finds nothing is broken.
    expect(writes.length).toBeGreaterThanOrEqual(NOT_A_USER_PASSWORD.length);
  });

  it('has no raw password write outside passwordWrite()', () => {
    const offenders = writes
      .filter(
        (w) =>
          w.file !== THE_SOURCE &&
          !NOT_A_USER_PASSWORD.some(
            (a) => a.file === w.file && a.where === w.where,
          ),
      )
      .map((w) => `${w.file}:${w.line} (${w.where})`);

    expect({ offenders, fix: FIX }).toEqual({ offenders: [], fix: FIX });
  });

  it('lists no allowance that no longer matches anything', () => {
    const stale = NOT_A_USER_PASSWORD.filter(
      (a) => !writes.some((w) => w.file === a.file && w.where === a.where),
    ).map((a) => `${a.file} (${a.where})`);

    expect(stale).toEqual([]);
  });

  it('mirrors every bump it makes', () => {
    // A path that bumps the version but never calls recordSessionsEnded()
    // leaves the old access tokens working for the rest of their hour.
    const missing = files
      .map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') }))
      .filter(
        ({ file, text }) =>
          file !== THE_SOURCE &&
          /\b(passwordWrite|endSessionsWrite)\(/.test(text) &&
          !/\brecordSessionsEnded\(/.test(text),
      )
      .map(({ file }) => file);

    expect(missing).toEqual([]);
  });
});
