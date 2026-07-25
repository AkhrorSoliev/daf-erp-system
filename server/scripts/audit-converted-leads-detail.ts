/**
 * audit-converted-leads-detail — READ-ONLY.
 * Har bir konvertatsiya qilingan lid uchun: lidning o'zi, convertedStudentId
 * o'quvchisi, va ISM bo'yicha mos keladigan boshqa o'quvchi(lar) — vaqt farqi
 * bilan. Maqsad: 2 akkaunt double-submit (soniyalar) yoki qo'lda qayta
 * yaratish (soatlar/kunlar) natijasi ekanini ajratish.
 */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, section } from './lib/check-cli';

function norm(s: string) {
  return s.trim().toLowerCase().replace(/[’'`]/g, "'");
}

async function main(prisma: PrismaClient) {
  printHeader('Konvertatsiya qilingan lidlar — tafsilot');

  const leads = await prisma.lead.findMany({
    where: { convertedStudentId: { not: null } },
    select: {
      id: true, firstName: true, lastName: true, phone: true, statusEnum: true,
      convertedStudentId: true, createdAt: true, deletedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const lead of leads) {
    const conv = await prisma.student.findUnique({
      where: { id: lead.convertedStudentId! },
      select: { id: true, firstName: true, lastName: true, phone: true, status: true, createdAt: true, deletedAt: true },
    });
    // ism bo'yicha mos keladigan barcha o'quvchilar (konvertatsiya qilinganidan tashqari)
    const siblings = await prisma.student.findMany({
      where: {
        OR: [
          { phone: lead.phone },
          { AND: [{ firstName: lead.firstName }, { lastName: lead.lastName }] },
        ],
      },
      select: { id: true, firstName: true, lastName: true, phone: true, status: true, createdAt: true, deletedAt: true },
      orderBy: { createdAt: 'asc' },
    });

    section(`Lid ${lead.id.slice(0, 8)} · ${lead.firstName} ${lead.lastName} · tel ${lead.phone} · lid=${lead.statusEnum}${lead.deletedAt ? ' (arxiv)' : ''}`);
    console.log(`  lid yaratilgan: ${lead.createdAt.toISOString().slice(0, 19).replace('T', ' ')}`);
    console.log(`  → convertedStudentId=${lead.convertedStudentId} ${conv ? `[${conv.status}${conv.deletedAt ? ',arxiv' : ''}] created ${conv.createdAt.toISOString().slice(0, 19).replace('T', ' ')}` : '(topilmadi)'}`);

    const others = siblings.filter((s) => s.id !== lead.convertedStudentId);
    if (others.length === 0) {
      console.log('  Boshqa mos akkaunt: yo\'q (dublikat ko\'rinmaydi)');
    } else {
      for (const o of others) {
        const deltaMs = conv ? Math.abs(o.createdAt.getTime() - conv.createdAt.getTime()) : 0;
        const deltaMin = Math.round(deltaMs / 60000);
        const deltaStr = deltaMin < 60 ? `${deltaMin} daq` : deltaMin < 1440 ? `${(deltaMin / 60).toFixed(1)} soat` : `${(deltaMin / 1440).toFixed(1)} kun`;
        const samePhone = norm(o.phone) === norm(lead.phone) ? 'bir tel' : `boshqa tel(${o.phone})`;
        console.log(`  ⚠ DUBLIKAT #${o.id} [${o.status}${o.deletedAt ? ',arxiv' : ''}] created ${o.createdAt.toISOString().slice(0, 19).replace('T', ' ')} · Δ=${deltaStr} · ${samePhone}`);
      }
    }
  }
}

run(main);
