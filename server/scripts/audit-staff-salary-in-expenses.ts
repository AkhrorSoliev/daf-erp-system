/**
 * audit-staff-salary-in-expenses — READ-ONLY.
 *
 * Xodimlar oyligi tizimning oylik moduliga kiritilmagan, lekin XARAJAT sifatida
 * yozilgan. Bu skript berilgan oy(lar)ning barcha xarajatlarini kategoriya va
 * izoh bo'yicha chiqaradi, oylikka o'xshash qatorlarni ajratib ko'rsatadi —
 * shundan xodimlarga qancha oylik berilgani aniqlanadi.
 *
 * Usage: railway run npx ts-node scripts/audit-staff-salary-in-expenses.ts 2026-06 2026-07
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { som, printTable, section, dbEnvLabel, dbHost } from './lib/check-cli';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Oylik/ish haqi ma'nosini beradigan kalit so'zlar (uz + ru + lotin/kirill). */
const SALARY_HINTS = [
  'oylik',
  'oylig',
  'ish haqi',
  'ishhaqi',
  'maosh',
  'zarplata',
  'зарплата',
  'oklad',
  'оклад',
  'salary',
  'ойлик',
  'иш хаки',
];

function looksLikeSalary(text: string): boolean {
  const t = text.toLowerCase();
  return SALARY_HINTS.some((h) => t.includes(h));
}

async function main() {
  console.log(`DB: ${dbHost()} [${dbEnvLabel()}]`);

  const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  if (months.length === 0) throw new Error('Oy(lar)ni bering: YYYY-MM');

  // Staff = ustoz bo'lmagan xodimlar (oylik kimga tegishli bo'lishi mumkinligini
  // aniqlash uchun ismlar bo'yicha ham qidiramiz).
  const staff = await prisma.user.findMany({
    where: {
      deletedAt: null,
      roles: { some: { role: { name: { in: ['CEO', 'Branch Director', 'Administrator', 'Cashier'] } } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  for (const month of months) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0)); // oyning oxirgi kuni (date-only ustun)

    section(`${month} — BARCHA XARAJATLAR (kategoriya bo'yicha)`);
    const byCat = await prisma.expense.groupBy({
      by: ['category'],
      where: { deletedAt: null, date: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    printTable(
      ['Kategoriya', 'Soni', 'Summa'],
      byCat
        .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
        .map((r) => [r.category, r._count._all, som(r._sum.amount ?? 0)]),
      ['l', 'r', 'r'],
    );
    const total = byCat.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
    console.log(`  JAMI: ${som(total)} so'm`);

    const rows = await prisma.expense.findMany({
      where: { deletedAt: null, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }],
      select: {
        id: true,
        date: true,
        category: true,
        amount: true,
        description: true,
        paymentMethod: true,
        relatedUserId: true,
        branchId: true,
      },
    });

    // Oylikka o'xshaganlar: izohda kalit so'z, yoki izohda xodim ismi bor.
    const staffNamed = (text: string) =>
      staff.find((u) => {
        const t = text.toLowerCase();
        return (
          (u.firstName && t.includes(u.firstName.toLowerCase().trim())) ||
          (u.lastName && u.lastName.trim().length > 2 && t.includes(u.lastName.toLowerCase().trim()))
        );
      });

    const suspects = rows.filter(
      (r) =>
        r.category !== 'TEACHER_ADVANCE' &&
        (looksLikeSalary(r.description ?? '') || !!staffNamed(r.description ?? '')),
    );

    section(`${month} — OYLIKKA O'XSHAGAN XARAJATLAR (${suspects.length} ta)`);
    if (suspects.length === 0) {
      console.log('  (topilmadi)');
    } else {
      printTable(
        ['Sana', 'Kategoriya', 'Summa', 'Usul', 'Filial', 'Izoh', 'Kim (taxmin)'],
        suspects.map((r) => {
          const who = staffNamed(r.description ?? '');
          return [
            r.date.toISOString().slice(0, 10),
            r.category,
            som(r.amount),
            r.paymentMethod,
            r.branchId ?? '—',
            (r.description ?? '').slice(0, 46),
            who
              ? `#${who.id} ${who.firstName} [${who.roles.map((x) => x.role.name).join(',')}]`
              : '—',
          ];
        }),
        ['l', 'l', 'r', 'l', 'r', 'l', 'l'],
      );
      console.log(
        `  Oylikka o'xshagan jami: ${som(suspects.reduce((s, r) => s + r.amount, 0))} so'm`,
      );
    }

    // Qolgan hamma narsani ham ko'rsatamiz — kalit so'z tutmagan oylik bo'lishi mumkin.
    const rest = rows.filter((r) => !suspects.includes(r) && r.category !== 'TEACHER_ADVANCE');
    section(`${month} — QOLGAN XARAJATLAR (${rest.length} ta) — o'zingiz ko'rib chiqing`);
    printTable(
      ['Sana', 'Kategoriya', 'Summa', 'Izoh'],
      rest.map((r) => [
        r.date.toISOString().slice(0, 10),
        r.category,
        som(r.amount),
        (r.description ?? '').slice(0, 58),
      ]),
      ['l', 'l', 'r', 'l'],
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
