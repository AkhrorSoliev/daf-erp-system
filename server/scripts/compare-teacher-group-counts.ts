/**
 * compare-teacher-group-counts — READ-ONLY.
 * Bir o'qituvchining har bir guruhida "O'quvchilar soni" ni ESKI (barcha
 * o'chirilmagan enrollmentlar, statussiz) va YANGI (faqat ACTIVE + o'chirilmagan
 * o'quvchi) mantiq bo'yicha yonma-yon ko'rsatadi.
 *
 * Usage: railway run npx ts-node scripts/compare-teacher-group-counts.ts <teacherId>
 */
import { PrismaClient } from '@prisma/client';
import { printHeader, section, printTable, run, parseArgs } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const { positional } = parseArgs();
  const teacherId = Number(positional[0]);
  if (!teacherId) {
    console.error('Usage: npx ts-node scripts/compare-teacher-group-counts.ts <teacherId>');
    process.exitCode = 1;
    return;
  }

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, firstName: true, lastName: true },
  });
  printHeader(`O'qituvchi #${teacherId} — guruh o'quvchilari: eski vs yangi`);
  if (!teacher) {
    console.log('  O\'qituvchi topilmadi.');
    return;
  }
  console.log(`  ${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trimEnd());

  // O'qituvchining o'chirilmagan guruhlari + har bir enrollment statusi
  const gts = await prisma.groupTeacher.findMany({
    where: { teacherId, group: { deletedAt: null } },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          enrollments: {
            where: { deletedAt: null },
            select: {
              status: true,
              student: { select: { deletedAt: true } },
            },
          },
        },
      },
    },
  });

  section('Guruhlar bo\'yicha');
  const rows: (string | number)[][] = [];
  let oldTotal = 0;
  let newTotal = 0;
  const statusKeys = ['ACTIVE', 'FROZEN', 'COMPLETED', 'DROPPED', 'TRANSFERRED'] as const;

  const seen = new Set<string>();
  for (const gt of gts) {
    const g = gt.group;
    if (seen.has(g.id)) continue; // bir guruhga ikki marta biriktirilgan bo'lsa
    seen.add(g.id);

    const counts: Record<string, number> = {};
    for (const k of statusKeys) counts[k] = 0;
    let oldCount = 0; // barcha o'chirilmagan enrollment (eski mantiq)
    let newCount = 0; // ACTIVE + o'chirilmagan o'quvchi (yangi mantiq)
    for (const e of g.enrollments) {
      oldCount++;
      counts[e.status] = (counts[e.status] ?? 0) + 1;
      if (e.status === 'ACTIVE' && e.student && e.student.deletedAt === null) {
        newCount++;
      }
    }
    oldTotal += oldCount;
    newTotal += newCount;

    const diff = oldCount - newCount;
    rows.push([
      g.name,
      g.status,
      oldCount, // ESKI
      newCount, // YANGI
      diff > 0 ? `−${diff}` : '0',
      counts.ACTIVE,
      counts.FROZEN,
      counts.COMPLETED,
      counts.DROPPED,
      counts.TRANSFERRED,
    ]);
  }

  printTable(
    ['Guruh', 'Holat', 'ESKI', 'YANGI', 'Farq', 'ACT', 'FRZ', 'COMP', 'DROP', 'TRNS'],
    rows,
    ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
  );

  section('Jami (barcha guruhlar yig\'indisi)');
  printTable(
    ['Mantiq', 'O\'quvchilar soni'],
    [
      ['ESKI (statussiz)', oldTotal],
      ['YANGI (faqat ACTIVE)', newTotal],
      ['Kamaydi', `−${oldTotal - newTotal}`],
    ],
    ['l', 'r'],
  );
  console.log(
    '\n  Izoh: ESKI = eng oldingi kod (deletedAt:null), YANGI = deploy qilingan tuzatish',
  );
  console.log('  (status=ACTIVE + o\'chirilmagan o\'quvchi). Farq = endi sanalmaydigan');
  console.log('  muzlatilgan/bitirgan/chiqib ketgan/o\'tgan o\'quvchilar.');
}

run(main);
