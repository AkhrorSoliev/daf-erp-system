/**
 * fix-refund-prepaid-mismatch — bitta pul ikki joyda turgan holatni to'g'rilaydi.
 *
 * MUAMMO. 2026-08-18 gacha `quickRefund` "foydalanilmagan darslar" ni
 * davomatdan hisoblab, balansga fantom kredit yozardi va
 * `prepaidLessonsRemaining` ga TEGMASDI. O'sha kuni chiqarilgan tuzatuvchi
 * skript fantom kreditni bekor qildi — lekin qaytarish AMALDA qoplagan
 * darslarni bekor qilmadi. Natijada o'quvchida bir vaqtda manfiy balans VA
 * ishlatilmagan darslar hisoblagichi qoldi: bitta pul ikki joyda.
 *
 * #10393 da bu 99 983 so'm qarz va 4 ta "to'langan" dars bo'lib ko'rinadi,
 * holbuki 100 000 so'm o'quvchining qo'liga naqd berilgan va o'sha pul aynan
 * shu darslarniki edi.
 *
 * YECHIM. Yetishmagan pulni qoplaydigan ENG KAM sondagi darsni bekor qilamiz
 * — bu `quickRefund` ning bugungi (to'g'rilangan) xatti-harakatining o'zi.
 * Yozuvni `EnrollmentBillingService.releasePrepaidLessons` bajaradi, ya'ni
 * ledgerga oddiy ADJUSTMENT qatori tushadi; hech qanday raw UPDATE yo'q va
 * append-only qoidasi buzilmaydi (ADR-0004).
 *
 * O'quvchining YIG'INDI holati o'zgarmaydi — pul faqat noto'g'ri maydondan
 * to'g'ri maydonga o'tadi. #10393: 33 349 → 33 349.
 *
 *   npx ts-node --transpile-only scripts/fix-refund-prepaid-mismatch.ts            (dry-run)
 *   npx ts-node --transpile-only scripts/fix-refund-prepaid-mismatch.ts --apply
 *   railway run npx ts-node --transpile-only scripts/fix-refund-prepaid-mismatch.ts --apply   (PROD)
 */
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EnrollmentBillingService } from '../src/billing/enrollment-billing.service';

const som = (n: number) => `${n.toLocaleString('ru-RU')} so'm`;

/** Faqat shu o'quvchilar tegiladi — audit topgan ro'yxat, kengaytirilmaydi. */
const DEFAULT_STUDENTS = [10393];

interface Plan {
  studentId: number;
  name: string;
  enrollmentId: string;
  groupNumber: number | null;
  balanceBefore: number;
  prepaidBefore: number;
  lessonsToCancel: number;
  credit: number;
  balanceAfter: number;
  prepaidAfter: number;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const ids = process.argv
    .filter((a) => /^--student=\d+$/.test(a))
    .map((a) => Number(a.split('=')[1]));
  const students = ids.length > 0 ? ids : DEFAULT_STUDENTS;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const billing = app.get(EnrollmentBillingService);

  console.log(
    apply
      ? '⚠  APPLY REJIMI — bazaga yoziladi\n'
      : 'DRY-RUN — bazaga hech narsa yozilmaydi\n',
  );

  const plans: Plan[] = [];

  for (const studentId of students) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, balance: true },
    });
    if (!student) {
      console.log(`#${studentId}: topilmadi — o'tkazib yuborildi`);
      continue;
    }

    // Qorovul: bu skript FAQAT "manfiy balans + ishlatilmagan dars" holatini
    // tuzatadi. Boshqa har qanday holatda tegmaydi.
    if (student.balance >= 0) {
      console.log(`#${studentId}: balans manfiy emas — tegilmadi`);
      continue;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE', prepaidLessonsRemaining: { gt: 0 } },
      select: {
        id: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            groupNumber: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
    if (enrollments.length === 0) {
      console.log(`#${studentId}: ishlatilmagan dars yo'q — tegilmadi`);
      continue;
    }
    // Bir nechta guruhda ochiq dars bo'lsa qaysinisidan olishni skript o'zi
    // hal qilmaydi — bu odam qaroriga qoldiriladi.
    if (enrollments.length > 1) {
      console.log(
        `#${studentId}: ${enrollments.length} ta guruhda ishlatilmagan dars bor — QO'LDA ko'rib chiqilsin`,
      );
      continue;
    }

    const enrollment = enrollments[0];
    const shortfall = -student.balance;

    // Yetishmagan pulni qoplaydigan eng kam dars soni. Narx paketning O'Z
    // summasidan olinadi (sikl qoldig'i bilan), shuning uchun bittalab
    // yuqoriga qadam tashlanadi — bo'lish emas.
    let lessonsToCancel = 0;
    let credit = 0;
    for (let n = 1; n <= enrollment.prepaidLessonsRemaining; n += 1) {
      credit = await billing.prepaidRefundValue(
        prisma,
        enrollment.id,
        enrollment.group.course,
        n,
      );
      lessonsToCancel = n;
      if (credit >= shortfall) break;
    }

    plans.push({
      studentId,
      name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
      enrollmentId: enrollment.id,
      groupNumber: enrollment.group.groupNumber,
      balanceBefore: student.balance,
      prepaidBefore: enrollment.prepaidLessonsRemaining,
      lessonsToCancel,
      credit,
      balanceAfter: student.balance + credit,
      prepaidAfter: enrollment.prepaidLessonsRemaining - lessonsToCancel,
    });
  }

  if (plans.length === 0) {
    console.log('\nTuzatiladigan o\'quvchi topilmadi.');
    await app.close();
    return;
  }

  for (const plan of plans) {
    const netBefore = plan.balanceBefore + valueOfAll(plan);
    console.log(`─── #${plan.studentId} ${plan.name} · guruh #${plan.groupNumber} ───`);
    console.log(`  balans           ${som(plan.balanceBefore).padStart(14)}  →  ${som(plan.balanceAfter)}`);
    console.log(`  oldindan to'langan ${String(plan.prepaidBefore).padStart(12)} dars  →  ${plan.prepaidAfter} dars`);
    console.log(`  bekor qilinadi   ${String(plan.lessonsToCancel).padStart(14)} dars  =  ${som(plan.credit)}`);
    console.log(`  yig'indi         ${som(netBefore).padStart(14)}  →  ${som(plan.balanceAfter + valueOfRemaining(plan))}   (o'zgarmasligi kerak)`);
    console.log('');
  }

  if (!apply) {
    console.log('Bajarish uchun: --apply qo\'shing.');
    await app.close();
    return;
  }

  for (const plan of plans) {
    await prisma.$transaction(
      async (tx) => {
        // Yozishdan OLDIN holat hali ham o'sha ekanini tekshiramiz — reja
        // tuzilgandan keyin dars o'tilgan yoki to'lov kelgan bo'lishi mumkin.
        const fresh = await tx.enrollment.findUnique({
          where: { id: plan.enrollmentId },
          select: { prepaidLessonsRemaining: true },
        });
        if (!fresh || fresh.prepaidLessonsRemaining !== plan.prepaidBefore) {
          throw new Error(
            `#${plan.studentId}: holat o'zgargan (prepaid ${fresh?.prepaidLessonsRemaining} ≠ ${plan.prepaidBefore}) — bekor qilindi`,
          );
        }
        await billing.releasePrepaidLessons(tx, {
          enrollmentId: plan.enrollmentId,
          lessons: plan.lessonsToCancel,
          reason:
            "18.08.2026 dagi pul qaytarish shu darslarni qoplagan edi — o'shanda hisoblagich kamaytirilmagan",
          metadata: { fix: 'refund-prepaid-mismatch', appliedAt: 'manual' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );

    const after = await prisma.student.findUnique({
      where: { id: plan.studentId },
      select: { balance: true },
    });
    console.log(`✓ #${plan.studentId} tuzatildi — balans endi ${som(after?.balance ?? 0)}`);
  }

  await app.close();
}

const valueOfAll = (plan: Plan) =>
  Math.round((plan.credit / plan.lessonsToCancel) * plan.prepaidBefore);
const valueOfRemaining = (plan: Plan) =>
  Math.round((plan.credit / plan.lessonsToCancel) * plan.prepaidAfter);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
