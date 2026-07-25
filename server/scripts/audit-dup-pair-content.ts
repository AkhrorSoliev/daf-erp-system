/** audit-dup-pair-content — READ-ONLY. Dublikat juftlarda kontent solishtirish. */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, printTable } from './lib/check-cli';

const IDS = [10561, 10593, 10563, 10580, 10566, 10583, 10567, 10577, 10562, 10564, 10565, 10568, 10732];

async function main(prisma: PrismaClient) {
  printHeader('Dublikat juft kontenti (stub vs real?)');
  const rows: (string | number)[][] = [];
  for (const id of IDS) {
    const s = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, status: true, deletedAt: true, balance: true,
        _count: { select: { enrollments: true, payments: true, attendances: true } },
      },
    });
    if (!s) { rows.push([id, '(yo\'q)', '', '', '', '', '', '']); continue; }
    rows.push([
      s.id, `${s.firstName} ${s.lastName}`.slice(0, 20),
      s.status + (s.deletedAt ? ',arx' : ''),
      s.balance,
      s._count.enrollments,
      s._count.payments,
      s._count.attendances,
    ]);
  }
  printTable(
    ['id', 'Ism', 'status', 'balans', 'enroll', 'pay', 'davomat'],
    rows,
    ['r', 'l', 'l', 'r', 'r', 'r', 'r'],
  );
}

run(main);
