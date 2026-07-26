/**
 * forensics-lead-dupes — READ-ONLY. Lid→o'quvchi dublikat bug'i uchun to'liq
 * forenzika:
 *  (1) Har bir ma'lum akkauntni KIM/NIMA yaratgani (EntityHistory CREATE).
 *  (2) Ism bo'yicha "Javohir G'aniyev" juftini izlash (telefon boshqa bo'lsa ham).
 *  (3) Telefon-unique xavfsizligi: HOZIR bir telefonda >1 o'chirilmagan o'quvchi bormi?
 *  (4) Ism-familiya bo'yicha o'chirilmagan dublikatlar (boshqa telefonli).
 *  (5) Har bir konvertatsiya lidi: manba + kim aylantirgani.
 */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, section, printTable } from './lib/check-cli';

const KNOWN = [10561, 10593, 10563, 10580, 10566, 10583, 10567, 10577, 10562, 10564, 10565, 10568, 10732, 10412, 10457, 10217, 10628];

async function creatorOf(prisma: PrismaClient, studentId: number) {
  const h = await prisma.entityHistory.findFirst({
    where: { entityType: 'Student', entityId: String(studentId), action: 'CREATE' as any },
    select: { changedById: true, createdAt: true, changedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return h;
}

async function main(prisma: PrismaClient) {
  printHeader('Forenzika: lid→o\'quvchi dublikatlar');

  // ── (1) kim yaratgani ──
  section('(1) Har bir akkauntni kim yaratgan (EntityHistory CREATE)');
  const rows1: (string | number)[][] = [];
  for (const id of KNOWN) {
    const s = await prisma.student.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, status: true, deletedAt: true, createdAt: true, userId: true },
    });
    if (!s) { rows1.push([id, '(yo\'q)', '', '', '', '', '']); continue; }
    const h = await creatorOf(prisma, id);
    const who = h?.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : (h ? `#${h.changedById ?? '—'}` : 'audit yo\'q');
    rows1.push([
      s.id, `${s.firstName} ${s.lastName}`.slice(0, 20),
      s.status + (s.deletedAt ? ',arx' : ''),
      s.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      who,
      s.userId ? `U${s.userId}` : 'User yo\'q',
    ]);
  }
  printTable(['id', 'Ism', 'status', 'created', 'yaratdi', 'portal'], rows1, ['r', 'l', 'l', 'l', 'l', 'l']);

  // ── (2) Javohir ism bo'yicha ──
  section('(2) "Javohir G\'aniyev" ism bo\'yicha (telefon e\'tiborsiz)');
  const jav = await prisma.student.findMany({
    where: { firstName: { contains: 'Javohir', mode: 'insensitive' }, lastName: { contains: 'aniyev', mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, phone: true, status: true, deletedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  printTable(
    ['id', 'Ism', 'telefon', 'status', 'created'],
    jav.map((s) => [s.id, `${s.firstName} ${s.lastName}`, s.phone, s.status + (s.deletedAt ? ',arx' : ''), s.createdAt.toISOString().slice(0, 16).replace('T', ' ')]),
    ['r', 'l', 'l', 'l', 'l'],
  );
  if (jav.length <= 1) console.log('  → Javohir uchun ikkinchi (asl) akkaunt YO\'Q — bu dublikat emas, yolg\'iz stub.');

  // ── (3) telefon-unique xavfsizligi ──
  section('(3) HOZIR bir telefonda >1 O\'CHIRILMAGAN o\'quvchi (unique indeksni bloklaydi)');
  const dupPhones = await prisma.student.groupBy({
    by: ['phone'],
    where: { deletedAt: null, phone: { not: '' } },
    _count: { _all: true },
    having: { phone: { _count: { gt: 1 } } },
  });
  if (dupPhones.length === 0) {
    console.log('  → Yo\'q. Partial-unique indeks (WHERE deletedAt IS NULL) XAVFSIZ qo\'llanadi.');
  } else {
    for (const g of dupPhones) {
      const list = await prisma.student.findMany({ where: { phone: g.phone, deletedAt: null }, select: { id: true, firstName: true, lastName: true, status: true } });
      console.log(`  ⚠ tel ${g.phone}: ${list.map((s) => `#${s.id} ${s.firstName} ${s.lastName} [${s.status}]`).join(' | ')}`);
    }
    console.log('  → Bu telefonlar oldin tozalanmasa, unique indeks yaratish MUVAFFAQIYATSIZ bo\'ladi.');
  }

  // ── (4) ism-familiya dublikatlari (o'chirilmagan) ──
  section('(4) O\'chirilmagan o\'quvchilar ichida ism+familiya takrori (boshqa telefonli dublikat ehtimoli)');
  const dupNames = await prisma.student.groupBy({
    by: ['firstName', 'lastName'],
    where: { deletedAt: null },
    _count: { _all: true },
    having: { firstName: { _count: { gt: 1 } } },
  });
  if (dupNames.length === 0) {
    console.log('  → Yo\'q.');
  } else {
    console.log(`  ${dupNames.length} ta ism takrorlanadi:`);
    for (const g of dupNames.slice(0, 30)) {
      const list = await prisma.student.findMany({ where: { firstName: g.firstName, lastName: g.lastName, deletedAt: null }, select: { id: true, phone: true, status: true } });
      const samePhone = new Set(list.map((s) => s.phone)).size < list.length;
      console.log(`  ${samePhone ? '⚠' : ' '} ${g.firstName} ${g.lastName}: ${list.map((s) => `#${s.id}(${s.phone})`).join(', ')}`);
    }
  }

  // ── (5) konvertatsiya lidlari: manba + kim aylantirgan ──
  section('(5) Konvertatsiya lidlari: manba + kim aylantirgan');
  const leads = await prisma.lead.findMany({
    where: { convertedStudentId: { not: null } },
    select: { id: true, firstName: true, lastName: true, convertedStudentId: true, statusChangedById: true, source: { select: { name: true } }, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const rows5: (string | number)[][] = [];
  for (const l of leads) {
    const who = l.statusChangedById
      ? await prisma.user.findUnique({ where: { id: l.statusChangedById }, select: { firstName: true, lastName: true } })
      : null;
    rows5.push([
      l.id.slice(0, 8), `${l.firstName} ${l.lastName}`.slice(0, 18),
      `→${l.convertedStudentId}`,
      l.source?.name ?? '—',
      who ? `${who.firstName} ${who.lastName}` : `#${l.statusChangedById ?? '—'}`,
    ]);
  }
  printTable(['lid', 'ism', 'student', 'manba', 'aylantirgan'], rows5, ['l', 'l', 'r', 'l', 'l']);
}

run(main);
