/**
 * LOCAL ONLY. S4 reminder data for the load test (spec S4 §8), AFTER the
 * S1–S3 seeds and `daf-yuklama-s3-hisob.ts` (last week settled):
 *  - the first 5 500 live students get a (fake) Telegram chat; every 25th of
 *    them is disconnected; the 500 past the 5 000 with attempts have no
 *    `DafStudentDay` row, so the 14-day rule leaves them out;
 *  - every 20th turns reminders off, through the module's own writer;
 *  - log history, through the module's own writer, around the evening day
 *    K = `s4KechkiKun()` (tomorrow) and the Monday H = `s4HaftalikKun()`:
 *    id % 7 — EVENING SENT on K−1 (the yesterday rule); id % 11 — EVENING
 *    SENT on K−2, K−4, K−6 (the 7-day window); id % 13 — EVENING FAILED on
 *    K−1 (does not count); id % 17 — EVENING FAILED on K (already claimed:
 *    no resend); id % 19 — WEEKLY SENT on K (no evening after a summary);
 *    id % 23 — WEEKLY FAILED on H (no second summary).
 * Run once per fresh DB: it refuses when reminder rows exist; undo with
 * `daf-yuklama-s4-tiklash.sql` (then it can run again).
 */
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { s4HaftalikKun, s4KechkiKun } from './daf-yuklama-kohort';
import { addDaysToDateStr } from '../../src/common/date/tashkent';
import {
  eslatmaniEgalla,
  natijaniYoz,
} from '../../src/daf/eslatma/eslatma-jurnali';
import { eslatmalarniSaqla } from '../../src/daf/eslatma/eslatma-sozlama';
import type {
  EslatmaHolati,
  EslatmaTuri,
} from '../../src/daf/eslatma/eslatma-qoidalari';

assertLocalDb();

const CHATLI = 5500;

run(async (prisma) => {
  if ((await prisma.dafReminderLog.count()) > 0) {
    throw new Error('Eslatma jurnali allaqachon bor. Bazani qayta yarating.');
  }
  // Snapshot of the settings the seed is about to touch: `daf-yuklama-s4-tiklash.sql`
  // puts them back exactly (the first run decides; later runs keep the table).
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS _bak_s4_setting AS
    SELECT "studentId", "remindersEnabled" FROM "DafStudentSetting"`;
  const db = prisma as any;
  const K = s4KechkiKun();
  const H = s4HaftalikKun();
  const chat = await prisma.$executeRaw`
    UPDATE "Student" s
    SET "telegramChatId" = (900000000 + s.id)::text,
        "telegramDisconnectedAt" = CASE WHEN s.id % 25 = 0 THEN (now() AT TIME ZONE 'UTC') END
    FROM (SELECT id FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT ${CHATLI}) t
    WHERE s.id = t.id`;
  const list = await prisma.student.findMany({
    where: { telegramChatId: { not: null }, deletedAt: null },
    select: { id: true, companyId: true },
    orderBy: { id: 'asc' },
  });
  let ochirildi = 0;
  let qatorlar = 0;
  const yoz = async (
    s: { id: number; companyId: number },
    kind: EslatmaTuri,
    sentOn: string,
    status: EslatmaHolati,
  ) => {
    const id = await eslatmaniEgalla(db, {
      companyId: s.companyId,
      studentId: s.id,
      kind,
      sentOn,
    });
    if (id === null) return;
    await natijaniYoz(db, id, status);
    qatorlar += 1;
  };
  for (const s of list) {
    if (s.id % 20 === 0) {
      await eslatmalarniSaqla(db, s.id, s.companyId, false);
      ochirildi += 1;
    }
    if (s.id % 7 === 0)
      await yoz(s, 'EVENING', addDaysToDateStr(K, -1), 'SENT');
    if (s.id % 11 === 0) {
      for (const d of [-2, -4, -6]) {
        await yoz(s, 'EVENING', addDaysToDateStr(K, d), 'SENT');
      }
    }
    if (s.id % 13 === 0)
      await yoz(s, 'EVENING', addDaysToDateStr(K, -1), 'FAILED');
    if (s.id % 17 === 0) await yoz(s, 'EVENING', K, 'FAILED');
    if (s.id % 19 === 0) await yoz(s, 'WEEKLY', K, 'SENT');
    if (s.id % 23 === 0) await yoz(s, 'WEEKLY', H, 'FAILED');
  }
  for (const t of ['Student', 'DafStudentSetting', 'DafReminderLog']) {
    await prisma.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(`"${t}"`)}`);
  }
  console.log({
    K,
    H,
    chat,
    chatli: list.length,
    uzilgan: list.filter((s) => s.id % 25 === 0).length,
    ochirildi,
    qatorlar,
  });
  if (list.length === 0 || qatorlar === 0) process.exitCode = 1;
});
