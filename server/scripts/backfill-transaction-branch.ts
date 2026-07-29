/**
 * backfill-transaction-branch — `branchId = null` tranzaksiyalarga filial yozadi.
 *
 * NEGA: filialsiz moliyaviy qator har qanday filial filtridan jimgina tushib
 * qoladi, ya'ni Σ(filiallar) kompaniya jamiga teng bo'lmaydi. Ikkinchi filial
 * ishga tushishidan OLDIN tozalanishi shart — Namanganda dars paydo bo'lgach
 * eski qatorning filialini ishonchli aniqlab bo'lmaydi.
 *
 * QOIDA: har bir qatorning filiali bog'langan obyektdan tiklanadi —
 *   1. `attendanceId` → `Attendance.group.branchId`
 *   2. `studentId`    → `StudentBranch`
 *   3. `teacherId`    → `UserBranch`
 * Uch manba bir nechta filialga ishora qilsa, qator TEGILMAYDI (qo'lda hal
 * qilinadi). `audit-null-branch-transactions.ts` 2026-07-29 da PRODda o'lchagan:
 * 8 966 tadan 8 966 tasi filial 1, noaniq 0 ta.
 *
 * QAYTARISH: qo'llashdan oldin tegilgan qatorlarning id lari
 * `scripts/backfill-transaction-branch-backup-<sana>.json` ga yoziladi.
 * Qaytarish = o'sha id larga `branchId = null` qaytarish.
 *
 * Usage (server/ ichidan):
 *   railway run npx ts-node scripts/backfill-transaction-branch.ts --dry-run
 *   railway run npx ts-node scripts/backfill-transaction-branch.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK = 500;

async function main() {
  console.log(`DB host: ${new URL(connectionString!).host}`);
  console.log(`RAILWAY: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local .env)'}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const rows = await prisma.transaction.findMany({
    where: { branchId: null },
    select: {
      id: true,
      type: true,
      studentId: true,
      teacherId: true,
      attendanceId: true,
    },
  });
  if (!rows.length) {
    console.log("Filialsiz tranzaksiya yo'q — hech narsa qilinmadi.");
    return;
  }
  console.log(`Filialsiz tranzaksiya: ${rows.length} ta`);

  const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean))] as number[];
  const teacherIds = [...new Set(rows.map((r) => r.teacherId).filter(Boolean))] as number[];
  const attIds = [...new Set(rows.map((r) => r.attendanceId).filter(Boolean))] as string[];

  const [sBranches, uBranches, atts] = await Promise.all([
    prisma.studentBranch.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, branchId: true },
    }),
    prisma.userBranch.findMany({
      where: { userId: { in: teacherIds } },
      select: { userId: true, branchId: true },
    }),
    prisma.attendance.findMany({
      where: { id: { in: attIds } },
      select: { id: true, group: { select: { branchId: true } } },
    }),
  ]);

  const sMap = new Map<number, Set<number>>();
  for (const b of sBranches) {
    if (!sMap.has(b.studentId)) sMap.set(b.studentId, new Set());
    sMap.get(b.studentId)!.add(b.branchId);
  }
  const uMap = new Map<number, Set<number>>();
  for (const b of uBranches) {
    if (!uMap.has(b.userId)) uMap.set(b.userId, new Set());
    uMap.get(b.userId)!.add(b.branchId);
  }
  const aMap = new Map(atts.map((a) => [a.id, a.group?.branchId]));

  // branchId -> tegishli tranzaksiya id lari
  const plan = new Map<number, string[]>();
  const ambiguous: { id: string; type: string; branches: string }[] = [];
  const unresolved: { id: string; type: string }[] = [];

  for (const r of rows) {
    const candidates = new Set<number>();
    if (r.attendanceId && aMap.get(r.attendanceId) != null) {
      candidates.add(aMap.get(r.attendanceId)!);
    }
    if (r.studentId) sMap.get(r.studentId)?.forEach((b) => candidates.add(b));
    if (r.teacherId) uMap.get(r.teacherId)?.forEach((b) => candidates.add(b));

    if (candidates.size === 0) {
      unresolved.push({ id: r.id, type: r.type });
    } else if (candidates.size > 1) {
      ambiguous.push({ id: r.id, type: r.type, branches: [...candidates].join(',') });
    } else {
      const branchId = [...candidates][0];
      plan.set(branchId, [...(plan.get(branchId) ?? []), r.id]);
    }
  }

  console.log('\n=== Reja ===');
  for (const [branchId, ids] of plan) {
    console.log(`  filial ${branchId} ← ${ids.length} ta qator`);
  }
  console.log(`  noaniq (bir nechta filial): ${ambiguous.length} ta`);
  console.log(`  aniqlanmadi (bog'lanmagan): ${unresolved.length} ta`);
  if (ambiguous.length) console.table(ambiguous.slice(0, 20));
  if (unresolved.length) console.table(unresolved.slice(0, 20));

  const willTouch = [...plan.values()].reduce((s, ids) => s + ids.length, 0);
  if (DRY_RUN) {
    console.log(`\nDRY RUN — ${willTouch} ta qator yangilanardi. Hech narsa yozilmadi.`);
    return;
  }

  // Qaytarish uchun zaxira: tegilgan id lar (hammasi hozir null).
  const stamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(
    __dirname,
    `backfill-transaction-branch-backup-${stamp}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: "Qaytarish: shu id larga branchId = null yoziladi (hammasi oldin null edi).",
        byBranch: Object.fromEntries([...plan.entries()]),
      },
      null,
      2,
    ),
  );
  console.log(`\nZaxira yozildi: ${backupPath}`);

  let updated = 0;
  for (const [branchId, ids] of plan) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await prisma.transaction.updateMany({
        where: { id: { in: slice }, branchId: null },
        data: { branchId },
      });
      updated += res.count;
      console.log(`  filial ${branchId}: ${updated}/${willTouch}`);
    }
  }

  const left = await prisma.transaction.count({ where: { branchId: null } });
  console.log(`\nYangilandi: ${updated} ta. Qolgan filialsiz: ${left} ta.`);
}

main()
  .catch((e) => {
    console.error('XATO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
