/**
 * ADR-0143 backfill: lessons a student was kept out of for non-payment
 * (ADR-0047) and has paid for since become «Keldi», with no teacher pay.
 * The same function the payment path calls (`markPaidBarredLessons`), so the
 * backfill and the live rule cannot disagree. Moves no money.
 *
 *   railway run npx ts-node --transpile-only scripts/backfill-late-payer-attendance.ts [--student=<id>]
 *   railway run npx ts-node --transpile-only scripts/backfill-late-payer-attendance.ts [--student=<id>] --apply --expect=<N>
 *
 * Without --apply: a dry run on a read-only connection (checked) that lists
 * every lesson. With --apply: scans again and aborts before writing when the
 * lesson count differs from --expect; then writes each student in its own
 * Serializable transaction. A failed student is logged, the run continues and
 * exits non-zero. A repeat finds nothing to do.
 */
import {
  EnrollmentStatus,
  MonthlyChargeStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { LessonAdmissionService } from '../src/billing/lesson-admission.service';
import {
  markPaidBarredLessons,
  type MarkedPaidLessons,
} from '../src/billing/paid-barred-lessons';
import {
  getSettingDefinition,
  type SettingKey,
} from '../src/settings/settings.types';
import { makePrisma, printHeader, printTable, section } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';

const USAGE =
  'Usage: backfill-late-payer-attendance.ts [--student=<id>] [--apply --expect=<N>]';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

/** The company-level setting as stored, else its default — what the API reads. */
function storedSettings(prisma: PrismaClient) {
  return {
    get: async (companyId: number, key: SettingKey) => {
      const row = await prisma.setting.findFirst({
        where: { companyId, key, branchId: null },
        select: { value: true },
      });
      const def = getSettingDefinition(key);
      return row ? def.parse(row.value) : def.defaultValue;
    },
  };
}

const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

async function main() {
  const argv = process.argv.slice(2);
  const studentArg = argv.find((a) => a.startsWith('--student='));
  const onlyStudent = studentArg ? Number(studentArg.slice(10)) : null;
  if (studentArg && !Number.isSafeInteger(onlyStudent)) {
    throw new UsageError(`--student must be an id. ${USAGE}`);
  }
  const { apply, expect } = parseApplyExpectArgs(
    argv.filter((a) => a !== studentArg),
    USAGE,
  );
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!apply) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = makePrisma();
  try {
    printHeader(
      `Kech to'lovchilar: to'lov yetgan darslar «Keldi» (ADR-0143) — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );
    if (!apply) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const admission = new LessonAdmissionService(
      prisma as never,
      storedSettings(prisma) as never,
    );
    const students = await prisma.student.findMany({
      where: {
        deletedAt: null,
        ...(onlyStudent ? { id: onlyStudent } : {}),
        enrollments: {
          some: {
            status: EnrollmentStatus.ACTIVE,
            deletedAt: null,
            monthlyCharges: { some: { status: MonthlyChargeStatus.CHARGED } },
          },
        },
      },
      select: { id: true, firstName: true, lastName: true, companyId: true },
      orderBy: { id: 'asc' },
    });

    const found: {
      s: (typeof students)[number];
      marks: MarkedPaidLessons[];
    }[] = [];
    for (const s of students) {
      const marks = await markPaidBarredLessons(
        prisma as unknown as Prisma.TransactionClient,
        admission,
        { studentId: s.id, companyId: s.companyId, write: false },
      );
      if (marks.length > 0) found.push({ s, marks });
    }
    const groups = await prisma.group.findMany({
      where: {
        id: { in: found.flatMap((f) => f.marks.map((m) => m.groupId)) },
      },
      select: { id: true, name: true },
    });
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    const lessons = found.reduce(
      (n, f) => n + f.marks.reduce((k, m) => k + m.days.length, 0),
      0,
    );

    section(`${found.length} o'quvchi, ${lessons} dars`);
    printTable(
      ['ID', "O'quvchi", 'Guruh', 'Darslar', 'Kunlar'],
      found.flatMap(({ s, marks }) =>
        marks.map((m) => [
          s.id,
          `${s.firstName} ${s.lastName}`.trim().slice(0, 28),
          groupName.get(m.groupId) ?? m.groupId,
          m.days.length,
          m.days.map(ddmm).join(', '),
        ]),
      ),
      ['l', 'l', 'l', 'r', 'l'],
    );

    if (!apply) {
      console.log(
        `\nDry run: nothing written. To apply: --apply --expect=${lessons}`,
      );
      return;
    }
    if (lessons !== expect) {
      throw new Error(
        `Scan found ${lessons} lesson(s) but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }

    let written = 0;
    const failures: string[] = [];
    for (const { s } of found) {
      try {
        const marks = await prisma.$transaction(
          (tx) =>
            markPaidBarredLessons(tx, admission, {
              studentId: s.id,
              companyId: s.companyId,
            }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        written += marks.reduce((n, m) => n + m.days.length, 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`#${s.id}: ${msg}`);
        console.error(`#${s.id} failed: ${msg}`);
      }
    }
    console.log(`\nWritten: ${written} lesson(s).`);
    if (failures.length > 0) {
      console.error(`${failures.length} student(s) failed.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? err.message : err);
  process.exitCode = 1;
});
