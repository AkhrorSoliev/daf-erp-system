/**
 * One-off: add the missing branch-scope argument to spec call sites.
 *
 * Making `ReportBranchIds` a REQUIRED parameter is what turns a forgotten scope
 * into a compile error instead of a silent company-wide read. The production
 * source was converted with it; the specs were left behind and catalogued in
 * `docs/branch-tsc-known-issues.md` (categories B and C).
 *
 * That backlog is not cosmetic. Jest does not typecheck, so those specs still
 * ran — passing `undefined` where a scope belongs, which `branchIdWhere`
 * normalises to `{}`, i.e. NO FILTER. Every one of them was asserting behaviour
 * under an accidentally-unscoped call while claiming to test the scoped one.
 *
 * `null` is the value added, deliberately: it means "every branch" and is
 * exactly what `undefined` was degrading to, so this changes the types without
 * changing a single assertion. Narrowing a spec to a real branch is a separate,
 * per-test decision — one this script must not make on anyone's behalf.
 *
 * Handles exactly ONE shape, deliberately:
 *
 *   TS2554  Expected N arguments, but got N-1  → append `null`
 *
 * Everything else is printed for a human, because two earlier attempts to be
 * cleverer both produced wrong code:
 *
 *   - Filling MORE than one missing argument assumed every gap was the scope.
 *     `getSectionLeads('sec-1')` needs `(sectionId, companyId, scope)`, so the
 *     script wrote `companyId: null` and the query started filtering on a
 *     company that does not exist. A missing `companyId` is a broken test, not
 *     a scope to default.
 *
 *   - Patching `branchIds` into "the object literal" assumed the argument WAS a
 *     literal. In `reports-financial.service.spec.ts` it is a shared `period`
 *     variable, so the script found the next unrelated `{` and wrote garbage
 *     into it. Those belong on the fixture, once, by hand — which is also less
 *     work: three fixtures cover twenty call sites.
 *
 *   npx ts-node scripts/fix-spec-branch-scope-args.ts --dry-run
 *   npx ts-node scripts/fix-spec-branch-scope-args.ts --apply [--file <path>]
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

interface TscError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

function collectErrors(): TscError[] {
  let out = '';
  try {
    out = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    // tsc exits non-zero when it finds errors — that IS the output we want.
    out = (e as { stdout?: string }).stdout ?? '';
  }
  const rows: TscError[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
    if (m) {
      rows.push({
        file: m[1],
        line: Number(m[2]),
        col: Number(m[3]),
        code: m[4],
        message: m[5],
      });
    }
  }
  return rows;
}

/**
 * Index of the `)` that closes the call whose `(` is at or after `from`.
 * String literals are skipped so a paren inside `"a(b"` cannot unbalance it.
 */
function findCallClose(src: string, from: number): number | null {
  const open = src.indexOf('(', from);
  if (open === -1) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function offsetOf(src: string, line: number, col: number): number {
  const lines = src.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1; i++) off += lines[i].length + 1;
  return off + col - 1;
}

function main() {
  const apply = process.argv.includes('--apply');
  const fileIdx = process.argv.indexOf('--file');
  const only = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

  const errors = collectErrors()
    .filter((e) => e.file.endsWith('.spec.ts'))
    .filter((e) => (only ? e.file === only : true));

  /** Exactly one argument short — that one is the scope, and nothing else is. */
  const missingArg = errors.filter((e) => {
    if (e.code !== 'TS2554') return false;
    const m = e.message.match(/Expected (\d+) arguments?, but got (\d+)/);
    return !!m && Number(m[1]) - Number(m[2]) === 1;
  });
  const other = errors.filter((e) => !missingArg.includes(e));

  console.log(`Bitta argument yetishmaydi (avtomatik): ${missingArg.length}`);
  console.log(`Qo'lda ko'rib chiqiladi:                ${other.length}`);
  if (other.length) {
    const byFile = new Map<string, number>();
    for (const e of other) byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1);
    for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${f} — ${n} ta`);
    }
  }

  if (!apply) {
    console.log('\nDRY RUN — hech narsa yozilmadi. Qo\'llash: --apply');
    return;
  }

  // Group by file and patch from the END so earlier offsets stay valid.
  const byFile = new Map<string, TscError[]>();
  for (const e of missingArg) {
    const list = byFile.get(e.file) ?? [];
    list.push(e);
    byFile.set(e.file, list);
  }

  let patched = 0;
  for (const [file, list] of byFile) {
    let src = readFileSync(file, 'utf8');
    const edits: { at: number; text: string }[] = [];

    for (const e of list) {
      const off = offsetOf(src, e.line, e.col);

      {
        const close = findCallClose(src, off);
        if (close === null) continue;
        // `foo(a, b)` → `foo(a, b, null)`
        // `foo()`     → `foo(null)`
        // `foo(\n  a,\n)` → `foo(\n  a,\n  null,\n)` — a multi-line call already
        // ends with a trailing comma, and adding another produced `a,\n, null)`,
        // which is what broke seven suites on the first run.
        const inner = src.slice(src.indexOf('(', off) + 1, close).trim();
        const sep = !inner ? '' : inner.endsWith(',') ? ' ' : ', ';
        edits.push({ at: close, text: `${sep}null` });
      }
    }

    edits.sort((a, b) => b.at - a.at);
    for (const ed of edits) {
      src = src.slice(0, ed.at) + ed.text + src.slice(ed.at);
      patched++;
    }
    writeFileSync(file, src);
    console.log(`  ${file} — ${edits.length} ta tuzatildi`);
  }
  console.log(`\nJami ${patched} ta joy tuzatildi.`);
}

main();
