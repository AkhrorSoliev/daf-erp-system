/**
 * audit-lead-conversion-dupes — READ-ONLY.
 * (a) Bitta telefon bo'yicha barcha o'quvchi akkauntlarini ko'rsatadi.
 * (b) Prod bo'ylab lid→o'quvchi konvertatsiyasidagi dublikat naqshni o'lchaydi:
 *     - bir xil telefonli >1 o'quvchi guruhlari
 *     - convertedStudentId qo'yilgan lidlar soni
 *     - shu telefonlarda EXPELLED + boshqa akkaunt bor holatlar
 */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, section, printTable } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const phoneArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  printHeader('Lid→o\'quvchi dublikat auditi');

  // ── (a) berilgan telefon bo'yicha akkauntlar ──
  if (phoneArg) {
    const list = await prisma.student.findMany({
      where: { phone: phoneArg },
      select: {
        id: true, firstName: true, lastName: true, status: true, balance: true,
        createdAt: true, deletedAt: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    section(`Telefon ${phoneArg} — o'quvchi akkauntlari (${list.length})`);
    printTable(
      ['id', 'Ism', 'status', 'balans', 'enroll', 'created', 'arxiv?'],
      list.map((s) => [
        s.id, `${s.firstName} ${s.lastName}`, s.status, s.balance,
        s._count.enrollments, s.createdAt.toISOString().slice(0, 16).replace('T', ' '),
        s.deletedAt ? 'ha' : '—',
      ]),
      ['r', 'l', 'l', 'r', 'r', 'l', 'l'],
    );
  }

  // ── (b) bir xil telefonli >1 o'quvchi (dublikatlar) ──
  const grouped = await prisma.student.groupBy({
    by: ['phone'],
    where: { phone: { not: '' } },
    _count: { _all: true },
    having: { phone: { _count: { gt: 1 } } },
  });
  section(`Bir xil telefonli >1 o'quvchi akkaunt guruhlari: ${grouped.length} ta`);

  // Har bir dublikat guruh haqida tafsilot + konvertatsiya bog'lami
  const rows: (string | number)[][] = [];
  let convertedInvolved = 0;
  for (const g of grouped) {
    const students = await prisma.student.findMany({
      where: { phone: g.phone },
      select: { id: true, firstName: true, lastName: true, status: true, createdAt: true, deletedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const lead = await prisma.lead.findFirst({
      where: { convertedStudentId: { in: students.map((s) => s.id) } },
      select: { convertedStudentId: true, createdAt: true },
    });
    if (lead) convertedInvolved++;
    const statuses = students.map((s) => s.status).join('/');
    const hasExpelled = students.some((s) => s.status === 'EXPELLED');
    rows.push([
      g.phone,
      g._count._all,
      students.map((s) => s.id).join(','),
      statuses,
      lead ? `→${lead.convertedStudentId}` : '—',
      hasExpelled ? 'ha' : '—',
    ]);
  }
  printTable(
    ['telefon', 'soni', 'student idlar', 'statuslar', 'lid konv.', 'EXPELLED bor?'],
    rows,
    ['l', 'r', 'l', 'l', 'l', 'l'],
  );

  // ── (c) umumiy statistika ──
  const totalConverted = await prisma.lead.count({ where: { convertedStudentId: { not: null } } });
  const convertedIds = (await prisma.lead.findMany({
    where: { convertedStudentId: { not: null } },
    select: { convertedStudentId: true },
  })).map((l) => l.convertedStudentId!) as number[];
  const expelledConverted = convertedIds.length
    ? await prisma.student.count({ where: { id: { in: convertedIds }, status: 'EXPELLED' } })
    : 0;

  section('Umumiy statistika');
  printTable(
    ['metrik', 'qiymat'],
    [
      ['Konvertatsiya qilingan lidlar (convertedStudentId≠null)', totalConverted],
      ['Ulardan EXPELLED bo\'lgan o\'quvchilar', expelledConverted],
      ['Bir xil telefonli dublikat guruhlar', grouped.length],
      ['Ularning lid-konvertatsiyaga aloqador qismi', convertedInvolved],
    ],
    ['l', 'r'],
  );
}

run(main);
