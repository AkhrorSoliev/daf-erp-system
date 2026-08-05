/**
 * Acceptance gate for TypeScript, scoped by FILE rather than by error count.
 *
 * WHY NOT COUNTS: an acceptance criterion like "B+C = 0, D = 28" is brittle in
 * both directions — fixing an unrelated file makes it fail, and adding a new
 * spec makes it fail. Worse, a count says nothing about WHICH errors are
 * tolerated, so the boundary drifts silently.
 *
 * The rule here instead:
 *
 *   • Production source (`src/**`, excluding `*.spec.ts`) may NEVER have an
 *     error. It cannot be added to the allowlist; the check refuses to.
 *   • Every other file with errors must be named in `docs/branch-tsc-known-issues.md`.
 *     A file with errors that is NOT listed fails the build.
 *   • Shrinking the list is free. Growing it requires editing that file, which
 *     shows up in review.
 *
 * `tsconfig.build.json` already excludes specs and `scripts/`, so `nest build`
 * is unaffected either way — this gate is about keeping the branch work's own
 * type debt visible and bounded, not about making `npm run build` pass.
 *
 *   npx ts-node scripts/check-tsc-scope.ts
 *   exit 0 = every erroring file is known · exit 1 = something new
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ALLOWLIST = join(__dirname, '..', '..', 'docs', 'branch-tsc-known-issues.md');

function knownFiles(): Set<string> {
  const md = readFileSync(ALLOWLIST, 'utf8');
  // Any `server/src/...` or `server/scripts/...` path in a list item.
  const out = new Set<string>();
  for (const m of md.matchAll(/^\s*[-*]\s+`?(server\/(?:src|scripts)\/[^\s`]+)`?/gm)) {
    out.add(m[1].replace(/^server\//, ''));
  }
  return out;
}

function tscErrorsByFile(): Map<string, number> {
  let out = '';
  try {
    out = execSync('npx tsc --noEmit', {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e: any) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const byFile = new Map<string, number>();
  for (const line of out.split('\n')) {
    const m = line.match(/^((?:src|scripts)\/[^(]+)\(\d+,\d+\): error TS\d+/);
    if (m) byFile.set(m[1], (byFile.get(m[1]) ?? 0) + 1);
  }
  return byFile;
}

function main() {
  const known = knownFiles();
  const errors = tscErrorsByFile();

  const production = [...errors.keys()].filter(
    (f) => f.startsWith('src/') && !f.endsWith('.spec.ts'),
  );
  const unknown = [...errors.keys()].filter(
    (f) => !known.has(f) && !production.includes(f),
  );

  if (production.length) {
    // Never tolerated, never allowlistable.
    console.error('PRODUCTION MANBADA XATO (hech qachon ruxsat etilmaydi):');
    production.forEach((f) => console.error(`  ${f} — ${errors.get(f)} ta`));
  }
  if (unknown.length) {
    console.error("\nRO'YXATDA YO'Q FAYLDA XATO:");
    unknown.forEach((f) => console.error(`  ${f} — ${errors.get(f)} ta`));
    console.error(`\nAgar bu ataylab bo'lsa, ${'docs/branch-tsc-known-issues.md'} ga qo'shing.`);
  }

  // Report shrinkage so the list gets cleaned up rather than rotting.
  const stale = [...known].filter((f) => !errors.has(f));
  if (stale.length) {
    console.log("\nRo'yxatda bor, lekin endi xatosiz (olib tashlash mumkin):");
    stale.forEach((f) => console.log(`  ${f}`));
  }

  const total = [...errors.values()].reduce((a, b) => a + b, 0);
  console.log(
    `\nJami: ${total} xato, ${errors.size} faylda ` +
      `(production ${production.length}, ro'yxatsiz ${unknown.length}).`,
  );

  process.exit(production.length || unknown.length ? 1 : 0);
}

main();
