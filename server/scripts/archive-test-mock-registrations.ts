/**
 * archive-test-mock-registrations — READ-ONLY sukut bo'yicha.
 *
 * CEO'ning o'z akkauntida (10003) test imtihonlariga qilingan ro'yxatlar
 * osilib qolgan: hech qachon to'lanmagan, balli yo'q, lekin imtihonlari
 * REGISTRATION_OPEN. Ular MockExamBillingService uchun hamon "to'lanmagan qarz"
 * bo'lib turibdi — akkaunt balansi to'lgan zahoti 44 000 so'm yechiladi.
 *
 * `paid=true` qilish YARAMAYDI — bu mock daromadini yolg'on ko'rsatardi.
 * To'g'ri yo'l: qatorni arxivlash (soft-delete). Qaytarish mumkin.
 *
 * Usage:
 *   railway run npx ts-node scripts/archive-test-mock-registrations.ts           (DRY-RUN)
 *   railway run npx ts-node scripts/archive-test-mock-registrations.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { som, printHeader, section, printTable, run } from './lib/check-cli';

const STUDENT_ID = 10003; // CEO test akkaunti
const PERFORMED_BY = 10000;

async function main(prisma: PrismaClient) {
  const apply = process.argv.includes('--apply');
  printHeader(`TEST MOCK RO'YXATLARINI ARXIVLASH — ${apply ? 'YOZISH' : 'DRY-RUN'}`);

  const rows = await prisma.mockExamParticipant.findMany({
    where: { studentId: STUDENT_ID, paid: false, deletedAt: null },
    select: {
      id: true, publicId: true, firstName: true, lastName: true, feeAmount: true,
      totalScore: true, gradedAt: true,
      exam: { select: { title: true, status: true, price: true } },
    },
    orderBy: { registeredAt: 'asc' },
  });

  // Xavfsizlik: balli kiritilgan (= imtihon topshirgan) qatorga TEGILMAYDI.
  const safe = rows.filter((r) => r.gradedAt == null && r.totalScore == null);
  const graded = rows.filter((r) => r.gradedAt != null || r.totalScore != null);

  section(`Topildi: ${rows.length} ta`);
  printTable(
    ['publicId', 'Ism', 'Imtihon', 'Holat', "To'lov", 'Ball', 'Amal'],
    rows.map((r) => [
      String(r.publicId), `${r.lastName} ${r.firstName}`, r.exam.title, r.exam.status,
      som(r.feeAmount ?? r.exam.price),
      r.totalScore == null ? '—' : String(r.totalScore),
      safe.includes(r) ? 'arxivlanadi' : 'TEGILMAYDI (ball bor)',
    ]),
    ['l', 'l', 'l', 'l', 'r', 'r', 'l'],
  );
  const blocked = safe.reduce((a, r) => a + (r.feeAmount ?? r.exam.price), 0);
  console.log(`\n  Arxivlanadi: ${safe.length} ta → ${som(blocked)} so'm yechim to'xtaydi`);
  if (graded.length) console.log(`  Tegilmaydi:  ${graded.length} ta (ball kiritilgan)`);

  if (!apply) {
    console.log('\n  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply');
    return;
  }
  if (!safe.length) return;

  const res = await prisma.mockExamParticipant.updateMany({
    where: { id: { in: safe.map((r) => r.id) }, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: PERFORMED_BY },
  });
  console.log(`\n  ✔ ${res.count} ta qator arxivlandi.`);

  const left = await prisma.mockExamParticipant.count({
    where: { studentId: STUDENT_ID, paid: false, deletedAt: null },
  });
  console.log(`  Qolgan kutayotgan qator: ${left} ta`);
}

run(main);
