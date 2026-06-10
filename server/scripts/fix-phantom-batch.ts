/**
 * Batch verify + fix of CONFIRMED late-joiner phantom attendance.
 *
 * Rule (objective, no teacher needed):
 *   - realtime mark = attendance entered same Tashkent day as the lesson.
 *   - trueJoin(student,group) = earliest lesson date with the student's OWN
 *     realtime mark in that group.
 *   - groupFirstLive(group) = earliest lesson date with ANY realtime mark.
 *   - CONFIRM the student as a late-joiner iff groupFirstLive < trueJoin
 *     (the group was demonstrably operating live BEFORE this student joined).
 *   - phantom = that student's billable lessons dated < trueJoin (they were
 *     necessarily back-filled, since trueJoin is their first live mark).
 *   Whole-group back-fills are auto-excluded (no live baseline → groupFirstLive
 *   == trueJoin), so they are left for teacher confirmation.
 *
 * Reverses each confirmed phantom (billable → EXCUSED) via the REAL
 * LessonBillingService. Dry-run by default; --apply to mutate.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, AttendanceStatus } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LessonBillingService } from '../src/billing/lesson-billing.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { TransactionsReadService } from '../src/transactions/transactions-read.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';

@Module({
  imports: [PrismaModule],
  providers: [TransactionsWriteService, TransactionsReadService, TransactionsService, SalaryAccrualService, LessonBillingService],
})
class FixModule {}

const APPLY = process.argv.includes('--apply');
const TEST_IDS = new Set([10003, 10028, 10051]);
const BILLABLE = new Set<AttendanceStatus>([AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.ABSENT]);

function tkStr(d: Date) {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function main() {
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? '').host} | Mode: ${APPLY ? '*** APPLY ***' : 'DRY RUN'}\n`);
  const app = await NestFactory.createApplicationContext(FixModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const billing = app.get(LessonBillingService);
  try {
    // all attendance (id, student, group, date, status, marker, createdAt)
    const atts = await prisma.attendance.findMany({
      select: { id: true, studentId: true, groupId: true, date: true, status: true, createdAt: true },
    });

    // gap (days) between lesson date and entry. prompt = entered within 3 days
    // (real attendance, possibly a touch late). bulk = entered >=10 days late
    // (a back-fill burst). The 4-9 day middle is treated as neither.
    const PROMPT = 3;
    const BULK = 10;
    const gapDays = (a: { date: Date; createdAt: Date }) =>
      Math.round((a.createdAt.getTime() - a.date.getTime()) / 86400000);

    // groupFirstLive = earliest lesson with ANY prompt mark (group provably
    // operating live by that date, with a known roster).
    const groupFirstLive = new Map<string, number>();
    // earliestPrompt per student+group = student's first prompt (real) mark.
    const earliestPrompt = new Map<string, number>();
    for (const a of atts) {
      if (gapDays(a) > PROMPT) continue;
      const lm = a.date.getTime();
      if (!groupFirstLive.has(a.groupId) || lm < groupFirstLive.get(a.groupId)!) groupFirstLive.set(a.groupId, lm);
      const k = `${a.studentId}|${a.groupId}`;
      if (!earliestPrompt.has(k) || lm < earliestPrompt.get(k)!) earliestPrompt.set(k, lm);
    }

    // CONFIRMED phantom: billable, BULK back-fill, group was live BEFORE the
    // lesson date, and the lesson predates the student's first prompt mark.
    type P = { attId: string; sid: number; gid: string; date: Date; status: AttendanceStatus };
    const phantomByStudentGroup = new Map<string, P[]>();
    for (const a of atts) {
      if (TEST_IDS.has(a.studentId)) continue;
      if (!BILLABLE.has(a.status)) continue;
      if (gapDays(a) < BULK) continue; // not a bulk back-fill → skip (legit/late)
      const k = `${a.studentId}|${a.groupId}`;
      const ep = earliestPrompt.get(k);
      if (ep === undefined) continue; // student never had a prompt mark here → uncertain
      if (a.date.getTime() >= ep) continue; // not before the student's real start
      const gfl = groupFirstLive.get(a.groupId);
      if (gfl === undefined || gfl >= a.date.getTime()) continue; // no live baseline before this date → unverifiable
      (phantomByStudentGroup.get(k) ?? phantomByStudentGroup.set(k, []).get(k)!).push({ attId: a.id, sid: a.studentId, gid: a.groupId, date: a.date, status: a.status });
    }

    // enrich + plan
    const sids = [...new Set([...phantomByStudentGroup.values()].flat().map((p) => p.sid))];
    const students = await prisma.student.findMany({ where: { id: { in: sids } }, select: { id: true, firstName: true, lastName: true, balance: true, companyId: true } });
    const sMap = new Map(students.map((s) => [s.id, s]));
    const groups = await prisma.group.findMany({ where: { id: { in: [...new Set([...phantomByStudentGroup.keys()].map((k) => k.split('|')[1]))] } }, select: { id: true, name: true, branchId: true } });
    const gMap = new Map(groups.map((g) => [g.id, g]));

    let totalLessons = 0;
    const plan: { sid: number; gid: string; dates: Date[] }[] = [];
    console.log('=== TASDIQLANGAN KECH-QO\'SHILGANLAR ===');
    for (const [k, ps] of [...phantomByStudentGroup.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const [sidS, gid] = k.split('|');
      const sid = Number(sidS);
      const s = sMap.get(sid)!;
      const g = gMap.get(gid)!;
      const ep = earliestPrompt.get(k)!;
      const gfl = groupFirstLive.get(gid)!;
      const dates = ps.map((p) => p.date).sort((a, b) => a.getTime() - b.getTime());
      totalLessons += dates.length;
      plan.push({ sid, gid, dates });
      console.log(
        `#${sid} ${s.firstName} ${s.lastName} | ${g.name} | bal ${s.balance.toLocaleString()} | guruh-live ${tkStr(new Date(gfl))} | o'quvchi real-boshl ${tkStr(new Date(ep))} | phantom: ${dates.map((d) => tkStr(d)).join(', ')}`,
      );
    }
    console.log(`\nJami: ${plan.length} o'quvchi, ${totalLessons} phantom dars`);

    if (!APPLY) { console.log('\n(DRY RUN — --apply bilan tuzatiladi.)'); return; }

    // apply
    console.log('\n=== TUZATISH ===');
    for (const item of plan) {
      const s = sMap.get(item.sid)!;
      const g = gMap.get(item.gid)!;
      const enr = await prisma.enrollment.findFirst({ where: { studentId: item.sid, groupId: item.gid }, select: { id: true } });
      if (!enr) { console.log(`#${item.sid}: enrollment topilmadi — skip`); continue; }
      const before = (await prisma.student.findUniqueOrThrow({ where: { id: item.sid }, select: { balance: true } })).balance;
      for (const date of item.dates) {
        const att = await prisma.attendance.findFirst({ where: { studentId: item.sid, groupId: item.gid, date }, select: { id: true, status: true } });
        if (!att || !BILLABLE.has(att.status)) continue;
        await prisma.$transaction(async (tx) => {
          await tx.attendance.update({ where: { id: att.id }, data: { status: AttendanceStatus.EXCUSED, note: 'Tuzatildi: o\'quvchi bu sanada guruhda yo\'q edi (xato retroaktiv davomat).' } });
          await billing.processAttendanceBilling(tx, {
            attendanceId: att.id, enrollmentId: enr.id, studentId: item.sid, groupId: item.gid,
            branchId: g.branchId, lessonDate: date, oldStatus: att.status, newStatus: AttendanceStatus.EXCUSED, companyId: s.companyId,
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
      }
      await prisma.entityHistory.create({
        data: { entityType: 'Student', entityId: String(item.sid), action: 'UPDATE', companyId: s.companyId,
          newValues: { action: 'DAVOMAT_TUZATILDI', izoh: `Kech qo'shilgan o'quvchi: qo'shilishdan oldingi xato retroaktiv darslar EXCUSED ga o'tkazildi.`, darslar: item.dates.map((d) => tkStr(d)) } },
      });
      const after = (await prisma.student.findUniqueOrThrow({ where: { id: item.sid }, select: { balance: true } })).balance;
      console.log(`#${item.sid} ${s.firstName} ${s.lastName}: ${before.toLocaleString()} → ${after.toLocaleString()} (${item.dates.length} dars)`);
    }
  } finally {
    await app.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
