/**
 * Branch-isolation release preflight. READ-ONLY — every statement is a SELECT.
 *
 *   railway run npx ts-node scripts/check-branch-deploy-preflight.ts
 *
 * Answers the questions that decide whether the release is safe to start, and
 * exits non-zero when any of them comes back wrong. Run it BEFORE the first
 * migration and AGAIN between each step (see `docs/branch-deploy-runbook.md`).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TENANCY_TABLES = [
  'Lead',
  'LeadColumn',
  'LeadSection',
  'LeadSource',
  'Holiday',
  'MockExamSection',
  'MockExam',
  'MockExamParticipant',
] as const;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'}  ${label.padEnd(46)} ${detail}`);
}

async function main() {
  const onRailway = !!process.env.RAILWAY_ENVIRONMENT;
  console.log(
    `\nMuhit: ${onRailway ? 'PROD (Railway)' : 'DEV (local .env)'}\n${'─'.repeat(74)}`,
  );

  // ── 1. Are the tenancy columns present? ───────────────────────────────────
  const cols = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT DISTINCT table_name FROM information_schema.columns
     WHERE column_name = 'companyId' AND table_name = ANY(${TENANCY_TABLES as unknown as string[]})`;
  const tenancyReady = cols.length === TENANCY_TABLES.length;
  console.log(
    `\nTenancy ustunlari: ${cols.length}/${TENANCY_TABLES.length} jadvalda` +
      (tenancyReady
        ? ' — migratsiya-1 QO\'LLANGAN'
        : " — migratsiya-1 hali QO'LLANMAGAN (kod deploy'idan oldin shart)"),
  );

  // NULLs only matter once the columns exist; before that the question is moot.
  if (tenancyReady) {
    let nulls = 0;
    for (const t of TENANCY_TABLES) {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${t}" WHERE "companyId" IS NULL`,
      );
      nulls += Number(r[0].n);
    }
    check('companyId IS NULL qatorlar', nulls === 0, `${nulls} ta`);
  }

  // ── 2. Who loses the ability to record money? ─────────────────────────────
  // The caller-branch check refuses a non-CEO with no branch attached. CEOs
  // deliberately have none and span everything, so only non-CEO staff matter.
  const stranded = await prisma.$queryRaw<{ id: number; name: string; roles: string }[]>`
    SELECT u.id, u."firstName" || ' ' || u."lastName" AS name,
           string_agg(r.name, ',') AS roles
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u.id
      JOIN "Role" r ON r.id = ur."roleId"
     WHERE u."deletedAt" IS NULL AND u."isActive" = true
       AND u."mainBranch" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "UserBranch" ub WHERE ub."userId" = u.id)
     GROUP BY u.id, name
    HAVING string_agg(r.name, ',') NOT LIKE '%Student%'
       AND string_agg(r.name, ',') NOT LIKE '%CEO%'`;
  check(
    'Filialsiz xodim (CEO va Student emas)',
    stranded.length === 0,
    stranded.length ? JSON.stringify(stranded) : 'yo\'q — pul yozish bloklanmaydi',
  );

  // ── 3. Cash accounts ──────────────────────────────────────────────────────
  const idx = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE tablename = 'CashAccount'`;
  const partial = idx.some(
    (i) => i.indexdef.includes('UNIQUE') && i.indexdef.includes('deletedAt'),
  );
  check('CashAccount partial unique indeks', partial, partial ? 'bor' : "YO'Q");

  const dupes = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (
      SELECT 1 FROM "CashAccount" WHERE "deletedAt" IS NULL
       GROUP BY "companyId", "branchId", type HAVING count(*) > 1
    ) d`;
  check('Aktiv dublikat kassa', Number(dupes[0].n) === 0, `${dupes[0].n} ta`);

  // ── 4. Branch id sequence ─────────────────────────────────────────────────
  const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(id) AS max FROM "Branch"`;
  const seq = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*) AS c FROM pg_class WHERE relkind = 'S' AND relname = 'Branch_id_seq'`;
  const hasSeq = Number(seq[0].c) > 0;
  console.log(
    `\nBranch: MAX(id)=${max}, ketma-ketlik ${hasSeq ? 'BOR (migratsiya-2 qo\'llangan)' : "yo'q (migratsiya-2 hali emas)"}`,
  );
  if (hasSeq) {
    const [{ last_value }] = await prisma.$queryRaw<{ last_value: bigint }[]>`
      SELECT last_value FROM "Branch_id_seq"`;
    check(
      'Ketma-ketlik mavjud id bilan to\'qnashmaydi',
      Number(last_value) >= (max ?? 0),
      `keyingi=${Number(last_value) + 1}, MAX=${max}`,
    );
  }

  // ── 5. Financial nulls — informational, NOT a failure ─────────────────────
  console.log('\nMoliyaviy branchId = null (taqsimlanmagan qatorlar):');
  for (const t of ['Payment', 'Transaction', 'CashMovement'] as const) {
    const r = await prisma.$queryRawUnsafe<{ n: bigint; total: bigint }[]>(
      `SELECT count(*) FILTER (WHERE "branchId" IS NULL) AS n, count(*) AS total FROM "${t}"`,
    );
    const note =
      t === 'CashMovement' && Number(r[0].n) > 0
        ? '  ← Batch 3 ataylab qoldirgan, tegilmaydi'
        : '';
    console.log(`   ${t.padEnd(14)} ${r[0].n} / ${r[0].total}${note}`);
  }

  // ── 6. Telegram groups ────────────────────────────────────────────────────
  const tg = await prisma.$queryRaw<{ title: string | null; branchId: number | null }[]>`
    SELECT title, "branchId" FROM "TelegramGroup"
     WHERE status = 'APPROVED' AND "deletedAt" IS NULL`;
  const unmapped = tg.filter((g) => g.branchId === null);
  console.log(`\nTasdiqlangan TG guruhlar: ${tg.length} ta`);
  tg.forEach((g) => console.log(`   ${g.title ?? '(nomsiz)'} → branchId=${g.branchId ?? 'NULL'}`));
  if (unmapped.length) {
    // Not a failure: an unmapped group is fail-closed by design — it simply
    // stops receiving branch events until someone assigns it a branch.
    console.log(
      `   ⚠️  ${unmapped.length} ta guruh filialsiz — ular filial hodisalarini OLMAYDI (fail-closed)`,
    );
  }

  console.log(
    `\n${'─'.repeat(74)}\n${failures === 0 ? '✅ Preflight toza' : `❌ ${failures} ta tekshiruv yiqildi`}\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('XATO:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
