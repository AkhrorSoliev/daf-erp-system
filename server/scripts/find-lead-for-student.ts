/** find-lead-for-student — READ-ONLY. Bir o'quvchiga bog'langan lidni topadi. */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, section, printTable } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const studentId = Number(process.argv.slice(2).filter((a) => !a.startsWith('--'))[0]);
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, firstName: true, lastName: true, phone: true, createdAt: true },
  });
  printHeader(`Lid izlash — o'quvchi #${studentId}`);
  if (!s) {
    console.log('  O\'quvchi topilmadi.');
    return;
  }
  console.log(`  ${s.firstName} ${s.lastName} · tel ${s.phone} · created ${s.createdAt.toISOString()}`);

  const byConvert = await prisma.lead.findMany({
    where: { convertedStudentId: studentId },
    select: { id: true, firstName: true, lastName: true, phone: true, statusEnum: true, status: true, convertedStudentId: true, createdAt: true, statusChangedAt: true, deletedAt: true },
  });
  const byPhoneName = await prisma.lead.findMany({
    where: {
      OR: [
        { phone: s.phone },
        { AND: [{ firstName: s.firstName }, { lastName: s.lastName }] },
      ],
    },
    select: { id: true, firstName: true, lastName: true, phone: true, statusEnum: true, status: true, convertedStudentId: true, createdAt: true, statusChangedAt: true, deletedAt: true },
  });

  const seen = new Set<string>();
  const all = [...byConvert, ...byPhoneName].filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));

  section(`Topilgan lidlar (${all.length})`);
  printTable(
    ['id (qisqa)', 'Ism', 'Telefon', 'statusEnum', 'convertedStudentId', 'created', 'arxiv?'],
    all.map((l) => [
      l.id.slice(0, 8),
      `${l.firstName} ${l.lastName}`,
      l.phone,
      l.statusEnum,
      l.convertedStudentId ?? '—',
      l.createdAt.toISOString().slice(0, 10),
      l.deletedAt ? 'ha' : '—',
    ]),
    ['l', 'l', 'l', 'l', 'r', 'l', 'l'],
  );
  if (all.length === 0) {
    console.log('\n  → Bu o\'quvchiga bog\'langan lid TOPILMADI (na convertedStudentId, na telefon/ism bo\'yicha).');
  }
}

run(main);
