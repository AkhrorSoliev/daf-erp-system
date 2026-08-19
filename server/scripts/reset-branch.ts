/**
 * reset-branch — filialni bo'shatadi: barcha o'quvchi, xodim, guruh, xona va
 * kursni QAYTARIB BO'LMAYDIGAN qilib o'chiradi. Filialning o'zi, kassa
 * hisoblari va lid ustuni qoladi, ya'ni filial keyin qaytadan to'ldirilishi
 * mumkin.
 *
 * Usage:
 *   npx ts-node scripts/reset-branch.ts --branch=2                          (dry-run)
 *   npx ts-node scripts/reset-branch.ts --branch=2 --dry-run                (aniq dry-run)
 *   npx ts-node scripts/reset-branch.ts --branch=2 --backup                 (dry-run + zaxira)
 *   npx ts-node scripts/reset-branch.ts --branch=2 --backup --confirm="Namangan filali"
 *
 * Prod uchun oldiga `railway run` qo'shing.
 *
 * `--confirm` qiymati DB dagi filial nomiga AYNAN mos kelishi kerak. Bu
 * `--branch=1` deb xato yozib qo'yishdan himoya qiladi: noto'g'ri raqam bilan
 * nom mos kelmaydi va skript to'xtaydi.
 *
 * `--dry-run` MAJBURIY dry-run: berilsa, `--confirm` bo'lsa ham hech nima
 * o'chirilmaydi — bu holat stdout'ga ochiq yoziladi, jimgina e'tiborsiz
 * qoldirilmaydi. Noma'lum bayroq (masalan `--dryrun` yoki `--dry_run`) xato
 * bilan to'xtaydi — "bayroq yozilgan, demak ishladi" degan noto'g'ri taassurot
 * qoldirmaslik uchun.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  buildBranchResetPlan,
  verifyBranchResetPlan,
  assertBranchIsFinanciallyEmpty,
  assertNoBlockingDependents,
  assertNoInboundReferences,
  BranchResetPlan,
} from '../src/branches/branch-reset-plan';
import { executeBranchReset, buildHistoryWhere } from '../src/branches/branch-reset-execute';
import { makePrisma, printHeader, section, printTable, dbEnvLabel } from './lib/check-cli';

interface Args {
  branchId: number;
  backup: boolean;
  confirm: string | null;
  dryRun: boolean;
}

/** Qiymat TALAB qiladigan bayroqlar — `--branch=2`, `--confirm="..."`. */
const VALUED_FLAGS = ['branch', 'confirm'];
/** Qiymat QABUL QILMAYDIGAN (bare) bayroqlar — `--backup`, `--dry-run`. */
const BOOLEAN_FLAGS = ['backup', 'dry-run'];
/** `parse()` qabul qiladigan yagona bayroqlar ro'yxati — noma'lum bayroq shu ro'yxat bilan xabarda ko'rsatiladi. */
const ACCEPTED_FLAGS = [...VALUED_FLAGS, ...BOOLEAN_FLAGS];

function parse(): Args {
  const argv = process.argv.slice(2);

  // Noma'lum bayroqni jimgina o'tkazib yubormaslik: bir harflik xato
  // (`--dryrun`, `--dry_run`) haqiqiy o'chirishga olib kelmasligi kerak.
  //
  // Qiymatli va bare shakllarni aralashtirib bo'lmaydi — boolean bayroqlar
  // (`--backup`, `--dry-run`) qiymatga QARAB emas, faqat argv ICHIDA
  // BORLIGIGA qarab o'qiladi (`argv.includes('--dry-run')`). Shuning uchun
  // `--dry-run=true` yozilsa, u ACCEPTED_FLAGS ro'yxatida "tanish" ko'rinadi,
  // lekin `includes('--dry-run')` uni hech qachon topmaydi va bayroq
  // JIMGINA hech narsa qilmaydi — bu esa aynan `--backup=true` (zaxira
  // olinmagan bo'lsa ham operator zaxira bor deb o'ylashi mumkin) va
  // `--dry-run=true` (haqiqiy o'chirish ishga tushadi) kabi tuzoqlarni qayta
  // ochadi. `--backup=false` o'zi ham ikki xil o'qilishi mumkin (ba'zilar uni
  // "zaxira olinmasin" deb o'qiydi) — shuning uchun taxmin qilish o'rniga bu
  // shakl BUTUNLAY rad etiladi. Kimdir keyinchalik "yordam" qilib boolean
  // parslashni qo'shmasin: qiymatli forma har doim xato bo'lib qolishi kerak.
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    const hasValue = eq !== -1;
    const name = hasValue ? token.slice(2, eq) : token.slice(2);
    if (!ACCEPTED_FLAGS.includes(name)) {
      console.error(
        `Noma'lum bayroq: --${name}\n` +
          `Qabul qilinadigan bayroqlar: ${ACCEPTED_FLAGS.map((f) => `--${f}`).join(', ')}`,
      );
      process.exit(1);
    }
    if (BOOLEAN_FLAGS.includes(name) && hasValue) {
      console.error(`--${name} qiymat qabul qilmaydi. To'g'ri shakl: --${name} (qiymatsiz).`);
      process.exit(1);
    }
    if (VALUED_FLAGS.includes(name) && !hasValue) {
      console.error(`--${name} qiymat talab qiladi. To'g'ri shakl: --${name}=<qiymat>.`);
      process.exit(1);
    }
  }

  const value = (name: string) => {
    const token = argv.find((a) => a.startsWith(`--${name}=`));
    return token ? token.slice(name.length + 3) : null;
  };
  const branch = value('branch');
  if (!branch || !Number.isInteger(Number(branch))) {
    console.error("--branch=<id> kerak. Masalan: --branch=2");
    process.exit(1);
  }

  const dryRun = argv.includes('--dry-run');
  const confirmValue = value('confirm');
  if (dryRun && confirmValue !== null) {
    console.log(
      "  --dry-run berilgan: --confirm E'TIBORGA OLINMAYDI, hech nima o'chirilmaydi.",
    );
  }

  return {
    branchId: Number(branch),
    backup: argv.includes('--backup'),
    // --dry-run bosh ustunlik qiladi: confirm berilgan bo'lsa ham majburan
    // null qilinadi, shuning uchun quyidagi "args.confirm === null" tekshiruvi
    // DRY-RUN yo'lini avtomatik tanlaydi.
    confirm: dryRun ? null : confirmValue,
    dryRun,
  };
}

/**
 * BOSHQA filiallarga tegishli, haqiqatda filial-doirali sanoqlar (`branchId:
 * { not: excludeBranchId }`). O'chishdan oldin va keyin olinadi; tushish
 * bo'lsa — o'chirish o'z doirasidan chiqib ketgan.
 */
async function otherBranchScopedTotals(
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
    enrollments: otherGroupIds.length
      ? await prisma.enrollment.count({ where: { groupId: { in: otherGroupIds } } })
      : 0,
  };
}

/**
 * KOMPANIYA BO'YLAB — filial bo'yicha EMAS — olingan sanoqlar. Reset
 * qilinayotgan filialning o'zi ham shu sonlarga kiradi (moliyaviy qorovul
 * uning ulushi har doim 0 ekanini kafolatlaydi, shuning uchun bu global
 * sonlarni "boshqa filial" sifatida o'qish xato emas — lekin ular filial
 * bo'yicha filtrlanmaganini bilib turish kerak, aks holda bu jadvaldagi
 * "tushish 0 bo'lishi kerak" degan qatorlar filial-doirali qatorlar bilan
 * bir xil narsani isbotlayotgandek noto'g'ri o'qiladi).
 */
async function companyWideTotals(prisma: PrismaClient): Promise<Record<string, number>> {
  return {
    users: await prisma.user.count(),
    payments: await prisma.payment.count(),
    transactions: await prisma.transaction.count(),
    attendances: await prisma.attendance.count(),
    salaryAccruals: await prisma.salaryAccrual.count(),
    cashAccounts: await prisma.cashAccount.count(),
    leadColumns: await prisma.leadColumn.count(),
    entityHistory: await prisma.entityHistory.count(),
  };
}

/** Ikkalasini bitta jadvalga birlashtiradi — chaqiruvchi ikkisini alohida bilishi shart emas. */
async function driftTotals(
  prisma: PrismaClient,
  excludeBranchId: number,
): Promise<Record<string, number>> {
  return {
    ...(await otherBranchScopedTotals(prisma, excludeBranchId)),
    ...(await companyWideTotals(prisma)),
  };
}

/**
 * SAQLANISHI SHART bo'lgan to'rttasi — reset REJASI ATAYLAB tegmaydigan
 * qatorlar: `Branch` qatorining o'zi, ikkala `CashAccount`, systemKey='NEW'
 * `LeadColumn` va uning `LeadSection`i. Bular `driftTotals` da yo'q, chunki
 * u aynan RESET QILINAYOTGAN filialni EXCLUDE qiladi — demak eng muhim
 * kafolat hech qachon o'lchanmasdi. `LeadSection`ning o'zida `branchId` yo'q
 * ("Board STRUCTURE is per branch" — `prisma/schema.prisma`), filial uning
 * `column` munosabati orqali topiladi.
 */
async function preservedTotals(
  prisma: PrismaClient,
  branchId: number,
): Promise<Record<string, number>> {
  return {
    branch: await prisma.branch.count({ where: { id: branchId } }),
    cashAccount: await prisma.cashAccount.count({ where: { branchId } }),
    leadColumn: await prisma.leadColumn.count({ where: { branchId } }),
    leadSection: await prisma.leadSection.count({ where: { column: { branchId } } }),
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
    await assertNoInboundReferences(prisma, plan);

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

    const before = await driftTotals(prisma, plan.branchId);
    const preservedBefore = await preservedTotals(prisma, plan.branchId);

    section("O'chirilmoqda");
    const { deleted, fresh } = await prisma.$transaction(
      async (tx) => {
        // Reja tranzaksiya ICHIDA qayta yig'iladi va qayta tekshiriladi:
        // dry-run bilan tasdiqlash orasida ma'lumot o'zgargan bo'lishi mumkin.
        const fresh = await buildBranchResetPlan(tx, plan.branchId);
        await verifyBranchResetPlan(tx, fresh);
        await assertBranchIsFinanciallyEmpty(tx, fresh);
        await assertNoBlockingDependents(tx, fresh);
        await assertNoInboundReferences(tx, fresh);
        const deleted = await executeBranchReset(tx, fresh);
        return { deleted, fresh };
      },
      { timeout: 120_000 },
    );

    printTable(
      ['Jadval', "O'chirildi"],
      Object.entries(deleted).map(([k, v]) => [k, v]),
      ['l', 'r'],
    );

    // Zaxira tranzaksiyadan OLDIN, `plan` asosida olingan edi; o'chirish esa
    // tranzaksiya ICHIDA qayta yig'ilgan `fresh` reja asosida bajarildi. Ikkisi
    // orasida ma'lumot siljigan bo'lishi mumkin (masalan, kimdir shu oraliqda
    // o'quvchini shu filialga qo'shdi). Bunday holda zaxira o'chirilgan
    // qatorlarning HAMMASINI qamrab olmagan bo'ladi — buni qayta zaxiralab
    // "tuzatib" bo'lmaydi, chunki qatorlar allaqachon o'chgan; faqat operatorni
    // ANIQ OGOHLANTIRISH mumkin.
    if (args.backup) {
      const idSetDiffers = (a: (string | number)[], b: (string | number)[]): boolean => {
        if (a.length !== b.length) return true;
        const sa = new Set(a.map(String));
        return b.some((x) => !sa.has(String(x)));
      };
      const compareFields: (keyof BranchResetPlan)[] = [
        'studentIds',
        'studentUserIds',
        'staffUserIds',
        'enrollmentIds',
        'groupIds',
        'roomIds',
        'courseIds',
        'snapshotIds',
      ];
      const shifted = compareFields.filter((field) =>
        idSetDiffers(plan[field] as (string | number)[], fresh[field] as (string | number)[]),
      );
      if (shifted.length) {
        section('OGOHLANTIRISH — zaxira reja bilan mos kelmaydi');
        console.error(
          `\n  DIQQAT: tranzaksiya ichida qayta yig'ilgan reja zaxira olingan paytdagi rejadan farq qiladi: ${shifted.join(', ')}.\n` +
            "  Zaxira BU FARQNI QAMRAB OLMAYDI — o'chirilgan, lekin zaxiralanmagan qatorlar bo'lishi mumkin.\n" +
            "  Zaxira qayta olinmaydi (qatorlar allaqachon o'chgan) — yuqoridagi ro'yxatlarni qo'lda solishtiring.",
        );
        process.exitCode = 1;
      }
    }

    const after = await driftTotals(prisma, plan.branchId);
    section('Boshqa filiallar — oldin / keyin');
    const drift: string[] = [];
    // Bu tekshiruv TENGLIK emas, YUQORI CHEGARA. `companyWideTotals`dagi
    // `users` va `entityHistory` KOMPANIYA bo'yicha hisoblanadi (filial
    // bo'yicha emas), va reset $transaction'i 120 soniyagacha davom etishi
    // mumkin — shu oyna ichida boshqa admin amaliyoti (o'quvchi ro'yxatga
    // olish, guruh tahriri va h.k.) EntityHistory yozadi yoki User yaratadi.
    // Bunday PARALLEL yozuv "tushish"ni kutilganidan kamroq (hatto manfiy)
    // ko'rsatadi — bu signal EMAS. Signal faqat tushish KUTILGANIDAN KO'P
    // bo'lganda: bu reja boshqa filialning qatorini o'chirib yuborgani
    // degani. Shuning uchun tenglik emas, faqat yuqori chegara
    // tekshiriladi — buni tenglikka "qattiqlashtirib" qo'ymang, aks holda har
    // bir parallel yozuv soxta halokat signali beradi (haqiqiy o'chirishdan
    // KEYIN, qaytarib bo'lmaydigan tarzda).
    const expectedDrop: Record<string, number> = {
      // Filialga tegishli sanoqlar — reset boshqa filialdan HECH NARSANI
      // olib tashlamasligi SHART, shuning uchun bo'sh joy 0.
      students: 0,
      groups: 0,
      rooms: 0,
      courses: 0,
      staffLinks: 0,
      enrollments: 0,
      payments: 0,
      transactions: 0,
      attendances: 0,
      salaryAccruals: 0,
      cashAccounts: 0,
      leadColumns: 0,
      // Kompaniya bo'yicha sanoqlar — shu skript o'chirgan qatorlar soniga
      // TENGDAN OSHMASLIGI kerak (kamroq bo'lishi parallel yozuv tufayli
      // normal).
      users: deleted.user ?? 0,
      entityHistory: deleted.entityHistory ?? 0,
    };
    printTable(
      ['Nima', 'Oldin', 'Keyin', 'Farq'],
      Object.keys(before).map((k) => {
        const actualDrop = before[k] - after[k];
        const expected = expectedDrop[k] ?? 0;
        const ok = actualDrop <= expected;
        if (!ok) drift.push(k);
        return [
          k,
          before[k],
          after[k],
          `${actualDrop} (kutilgan: ≤${expected})${ok ? '' : ' — MOS EMAS'}`,
        ];
      }),
      ['l', 'r', 'r', 'r'],
    );

    if (drift.length) {
      console.error(
        `\n  DIQQAT: boshqa filialdan kutilganidan ORTIQ ma'lumot o'chgan bo'lishi mumkin: ${drift.join(', ')}`,
      );
      process.exitCode = 1;
    } else {
      console.log("\n  Boshqa filiallardan kutilganidan ortiq hech narsa o'chirilmadi.");
    }

    const preservedAfter = await preservedTotals(prisma, plan.branchId);
    section("SAQLANISHI SHART — filial, kassa hisoblari, lid ustuni/bo'limi");
    const preservedDrift: string[] = [];
    printTable(
      ['Nima', 'Oldin', 'Keyin'],
      Object.keys(preservedBefore).map((k) => {
        if (preservedBefore[k] !== preservedAfter[k]) preservedDrift.push(k);
        return [k, preservedBefore[k], preservedAfter[k]];
      }),
      ['l', 'r', 'r'],
    );

    if (preservedDrift.length) {
      console.error(
        `\n  KRITIK: saqlanishi SHART bo'lgan qator(lar) o'zgardi: ${preservedDrift.join(', ')}. ` +
          "Filial pul qabul qila olmasligi yoki /leads sahifasi ishlamasligi mumkin.",
      );
      process.exitCode = 1;
    } else {
      console.log(
        "\n  Saqlanishi SHART bo'lgan barcha qatorlar joyida: filial, kassa hisoblari, lid ustuni va bo'limi.",
      );
    }
  } catch (e) {
    console.error(e instanceof Error ? `\n${e.name}: ${e.message}` : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
