/**
 * reset-branch — filialni bo'shatadi: barcha o'quvchi, xodim, guruh, xona va
 * kursni QAYTARIB BO'LMAYDIGAN qilib o'chiradi. Filialning o'zi, kassa
 * hisoblari va lid ustuni qoladi, ya'ni filial keyin qaytadan to'ldirilishi
 * mumkin.
 *
 * Usage:
 *   npx tsx scripts/reset-branch.ts --branch=2                          (dry-run)
 *   npx tsx scripts/reset-branch.ts --branch=2 --backup                 (dry-run + zaxira)
 *   npx tsx scripts/reset-branch.ts --branch=2 --backup --confirm="Namangan filali"
 *
 * Prod uchun oldiga `railway run` qo'shing.
 *
 * `--confirm` qiymati DB dagi filial nomiga AYNAN mos kelishi kerak. Bu
 * `--branch=1` deb xato yozib qo'yishdan himoya qiladi: noto'g'ri raqam bilan
 * nom mos kelmaydi va skript to'xtaydi.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  buildBranchResetPlan,
  verifyBranchResetPlan,
  assertBranchIsFinanciallyEmpty,
  assertNoBlockingDependents,
  BranchResetPlan,
} from '../src/branches/branch-reset-plan';
import { executeBranchReset, buildHistoryWhere } from '../src/branches/branch-reset-execute';
import { makePrisma, printHeader, section, printTable, dbEnvLabel } from './lib/check-cli';

interface Args {
  branchId: number;
  backup: boolean;
  confirm: string | null;
}

function parse(): Args {
  const argv = process.argv.slice(2);
  const value = (name: string) => {
    const token = argv.find((a) => a.startsWith(`--${name}=`));
    return token ? token.slice(name.length + 3) : null;
  };
  const branch = value('branch');
  if (!branch || !Number.isInteger(Number(branch))) {
    console.error("--branch=<id> kerak. Masalan: --branch=2");
    process.exit(1);
  }
  return {
    branchId: Number(branch),
    backup: argv.includes('--backup'),
    confirm: value('confirm'),
  };
}

/**
 * Boshqa filiallarning jadval sanoqlari. O'chishdan oldin va keyin olinadi;
 * farq bo'lsa — o'chirish o'z doirasidan chiqib ketgan.
 */
async function otherBranchTotals(
  prisma: PrismaClient,
  excludeBranchId: number,
): Promise<Record<string, number>> {
  const not = { not: excludeBranchId };
  const otherStudentIds = (
    await prisma.studentBranch.findMany({
      where: { branchId: not },
      select: { studentId: true },
    })
  ).map((r) => r.studentId);
  const otherGroupIds = (
    await prisma.group.findMany({ where: { branchId: not }, select: { id: true } })
  ).map((g) => g.id);

  return {
    students: otherStudentIds.length,
    groups: otherGroupIds.length,
    rooms: await prisma.room.count({ where: { branchId: not } }),
    courses: await prisma.course.count({ where: { branchId: not } }),
    staffLinks: await prisma.userBranch.count({ where: { branchId: not } }),
    users: await prisma.user.count(),
    enrollments: otherGroupIds.length
      ? await prisma.enrollment.count({ where: { groupId: { in: otherGroupIds } } })
      : 0,
    payments: await prisma.payment.count(),
    transactions: await prisma.transaction.count(),
    attendances: await prisma.attendance.count(),
    salaryAccruals: await prisma.salaryAccrual.count(),
    cashAccounts: await prisma.cashAccount.count(),
    leadColumns: await prisma.leadColumn.count(),
    entityHistory: await prisma.entityHistory.count(),
  };
}

/** O'chishdan oldin barcha qatorlarni JSON qilib yozadi. */
async function writeBackup(prisma: PrismaClient, plan: BranchResetPlan): Promise<string> {
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `branch-${plan.branchId}-reset-${stamp}.json`);

  const { studentIds, studentUserIds, staffUserIds, groupIds, roomIds, courseIds, enrollmentIds } =
    plan;
  const allUserIds = [...studentUserIds, ...staffUserIds];
  // `executeBranchReset`'dagi `historyIds`ning AYNAN o'zi — entityHistory /
  // statusHistory so'rovini o'chirish bilan bir xil holatda o'tkazib
  // yuborish (yoki yubormaslik) uchun.
  const historyIds = [
    ...studentIds,
    ...enrollmentIds,
    ...groupIds,
    ...roomIds,
    ...courseIds,
    ...allUserIds,
  ];

  const payload = {
    takenAt: new Date().toISOString(),
    env: dbEnvLabel(),
    plan,
    rows: {
      branch: await prisma.branch.findUnique({ where: { id: plan.branchId } }),
      students: studentIds.length
        ? await prisma.student.findMany({ where: { id: { in: studentIds } } })
        : [],
      users: allUserIds.length
        ? await prisma.user.findMany({ where: { id: { in: allUserIds } } })
        : [],
      userRoles: allUserIds.length
        ? await prisma.userRole.findMany({ where: { userId: { in: allUserIds } } })
        : [],
      userBranches: staffUserIds.length
        ? await prisma.userBranch.findMany({ where: { userId: { in: staffUserIds } } })
        : [],
      enrollments: enrollmentIds.length
        ? await prisma.enrollment.findMany({ where: { id: { in: enrollmentIds } } })
        : [],
      groups: groupIds.length
        ? await prisma.group.findMany({ where: { id: { in: groupIds } } })
        : [],
      rooms: roomIds.length ? await prisma.room.findMany({ where: { id: { in: roomIds } } }) : [],
      courses: courseIds.length
        ? await prisma.course.findMany({ where: { id: { in: courseIds } } })
        : [],
      smsMessages: studentIds.length
        ? await prisma.smsMessage.findMany({ where: { studentId: { in: studentIds } } })
        : [],
      snapshots: plan.snapshotIds.length
        ? await prisma.dailyFinancialSnapshot.findMany({ where: { id: { in: plan.snapshotIds } } })
        : [],
      // Quyidagi 11 ta jadval `executeBranchReset`ning o'chirish ro'yxatiga
      // kirgani uchun shu yerda ham bo'lishi SHART — aks holda zaxira
      // haqiqatda o'chadigan ma'lumotning bir qismini tashlab ketgan bo'lardi.
      // Har biri executor ishlatgan XUDDI SHU ID to'plamiga qarab so'raladi.
      enrollmentStateLogs: enrollmentIds.length
        ? await prisma.enrollmentStateLog.findMany({
            where: { enrollmentId: { in: enrollmentIds } },
          })
        : [],
      studentBranches: studentIds.length
        ? await prisma.studentBranch.findMany({ where: { studentId: { in: studentIds } } })
        : [],
      notifications: allUserIds.length
        ? await prisma.notification.findMany({ where: { userId: { in: allUserIds } } })
        : [],
      groupScheduleSnapshots: groupIds.length
        ? await prisma.groupScheduleSnapshot.findMany({ where: { groupId: { in: groupIds } } })
        : [],
      groupHolidayExtensions: groupIds.length
        ? await prisma.groupHolidayExtension.findMany({ where: { groupId: { in: groupIds } } })
        : [],
      groupTeacherHistories: groupIds.length
        ? await prisma.groupTeacherHistory.findMany({ where: { groupId: { in: groupIds } } })
        : [],
      groupTeachers: groupIds.length
        ? await prisma.groupTeacher.findMany({ where: { groupId: { in: groupIds } } })
        : [],
      roomCapacitySnapshots: roomIds.length
        ? await prisma.roomCapacitySnapshot.findMany({ where: { roomId: { in: roomIds } } })
        : [],
      coursePriceSnapshots: courseIds.length
        ? await prisma.coursePriceSnapshot.findMany({ where: { courseId: { in: courseIds } } })
        : [],
      // `entityHistory`/`statusHistory` ikkalasi ham `executor`niki bilan
      // ayni bitta `where` shartidan o'qiladi (`buildHistoryWhere`, Task 3'dan
      // eksport qilingan) — shart ikki joyda qo'lda nusxalanmasin, aks holda
      // executor o'zgarganda zaxira sirli tarzda eskirib qoladi. Bo'sh
      // bo'lishi mumkinligi ham executor bilan bir xil ID ro'yxati bilan
      // tekshiriladi.
      entityHistory: historyIds.length
        ? await prisma.entityHistory.findMany({ where: buildHistoryWhere(plan) })
        : [],
      statusHistory: historyIds.length
        ? await prisma.statusHistory.findMany({ where: buildHistoryWhere(plan) })
        : [],
    },
  };

  fs.writeFileSync(
    file,
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1),
  );
  return file;
}

async function main() {
  const args = parse();
  const prisma = makePrisma();

  try {
    printHeader(`Filialni bo'shatish — #${args.branchId}`);

    const plan = await buildBranchResetPlan(prisma, args.branchId);
    await verifyBranchResetPlan(prisma, plan);
    await assertBranchIsFinanciallyEmpty(prisma, plan);
    await assertNoBlockingDependents(prisma, plan);

    section(`Filial: ${plan.branchName} (#${plan.branchId})`);
    printTable(
      ["O'chadigan", 'Soni'],
      [
        ["O'quvchi", plan.studentIds.length],
        ["O'quvchi akkaunti", plan.studentUserIds.length],
        ['Xodim', plan.staffUserIds.length],
        ['Enrollment', plan.enrollmentIds.length],
        ['Guruh', plan.groupIds.length],
        ['Xona', plan.roomIds.length],
        ['Kurs', plan.courseIds.length],
        ['Kunlik surat', plan.snapshotIds.length],
      ],
      ['l', 'r'],
    );

    section('Saqlanadi');
    console.log('  Filial qatorining o\'zi, kassa hisoblari, lid ustuni va bo\'limi');
    if (plan.keptUserIds.length) {
      console.log(`  Bir nechta filialda turgan foydalanuvchilar: ${plan.keptUserIds.join(', ')}`);
    }

    if (args.backup) {
      const file = await writeBackup(prisma, plan);
      section('Zaxira');
      console.log(`  ${file}`);
    }

    if (args.confirm === null) {
      section('DRY-RUN');
      console.log("  Hech nima o'chirilmadi.");
      console.log(
        `  Haqiqiy o'chirish uchun: --branch=${plan.branchId} --backup --confirm="${plan.branchName}"`,
      );
      return;
    }

    if (args.confirm !== plan.branchName) {
      console.error(
        `\n  --confirm nomi mos kelmadi.\n  Kutilgan: "${plan.branchName}"\n  Berilgan: "${args.confirm}"`,
      );
      process.exitCode = 1;
      return;
    }

    const before = await otherBranchTotals(prisma, plan.branchId);

    section("O'chirilmoqda");
    const deleted = await prisma.$transaction(
      async (tx) => {
        // Reja tranzaksiya ICHIDA qayta yig'iladi va qayta tekshiriladi:
        // dry-run bilan tasdiqlash orasida ma'lumot o'zgargan bo'lishi mumkin.
        const fresh = await buildBranchResetPlan(tx, plan.branchId);
        await verifyBranchResetPlan(tx, fresh);
        await assertBranchIsFinanciallyEmpty(tx, fresh);
        await assertNoBlockingDependents(tx, fresh);
        return executeBranchReset(tx, fresh);
      },
      { timeout: 120_000 },
    );

    printTable(
      ['Jadval', "O'chirildi"],
      Object.entries(deleted).map(([k, v]) => [k, v]),
      ['l', 'r'],
    );

    const after = await otherBranchTotals(prisma, plan.branchId);
    section('Boshqa filiallar — oldin / keyin');
    const drift: string[] = [];
    // `users` va `entityHistory` kompaniya bo'yicha olinadi (filial bo'yicha
    // emas), shuning uchun ular tushishi KUTILADI — bu shu filial xodimlari
    // va ularning tarixi o'chgani degani. Lekin TUSHISH MIQDORI aniq shu
    // ishga tushirish o'chirgan `user`/`entityHistory` qatorlari soniga TENG
    // bo'lishi SHART: agar reja xatosi tufayli boshqa filialning
    // foydalanuvchisi yoki tarix qatori o'chib ketgan bo'lsa, sanoq baribir
    // tushadi — faqat tenglik tekshiruvi buni ushlaydi, oddiy "farq bor/yo'q"
    // esa buni sezmaydi.
    const expectedDrop: Record<string, number> = {
      users: deleted.user ?? 0,
      entityHistory: deleted.entityHistory ?? 0,
    };
    printTable(
      ['Nima', 'Oldin', 'Keyin', 'Farq'],
      Object.keys(before).map((k) => {
        const diff = after[k] - before[k];
        if (k in expectedDrop) {
          const actualDrop = before[k] - after[k];
          const expected = expectedDrop[k];
          const ok = actualDrop === expected;
          if (!ok) drift.push(k);
          return [
            k,
            before[k],
            after[k],
            `${actualDrop} (kutilgan: ${expected})${ok ? '' : ' — MOS EMAS'}`,
          ];
        }
        if (diff !== 0) drift.push(k);
        return [k, before[k], after[k], diff === 0 ? '—' : diff];
      }),
      ['l', 'r', 'r', 'r'],
    );

    if (drift.length) {
      console.error(`\n  DIQQAT: boshqa filial ma'lumoti o'zgardi: ${drift.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log("\n  Boshqa filiallarning ma'lumoti o'zgarmadi.");
    }
  } catch (e) {
    console.error(e instanceof Error ? `\n${e.name}: ${e.message}` : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
