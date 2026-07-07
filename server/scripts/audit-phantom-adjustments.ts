/**
 * READ-ONLY audit: find manual debit ADJUSTMENT transactions (qarz qo'shuvchi)
 * whose cited lesson dates are PHANTOM (no matching attendance) or fall in APRIL
 * (pre-cutover) — the #10284 pattern. Scans every company/student.
 *
 * Usage: railway run npx ts-node --transpile-only scripts/audit-phantom-adjustments.ts
 */
import { PrismaClient } from '@prisma/client';
import { run } from './lib/check-cli';

const MAY1 = '2026-05-01';

function fmt(n: number) {
  return n.toLocaleString('ru-RU').replace(/,/g, ' ');
}

/** Extract YYYY-MM-DD date strings cited in a free-text description. */
function extractDates(desc: string): string[] {
  const out = new Set<string>();
  // DD/MM, DD.MM, DD-MM  (year assumed 2026)
  const re1 = /\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(desc))) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3] ?? '2026';
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    // sanity: month 1-12, day 1-31
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) {
      out.add(`${yyyy}-${mm}-${dd}`);
    }
  }
  // explicit YYYY-MM-DD
  const re2 = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = re2.exec(desc))) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  return [...out];
}

async function main(prisma: PrismaClient) {
  console.log('\n══ AUDIT: fantom / aprel manfiy ADJUSTMENT yozuvlari ══\n');

  // All ADJUSTMENT transactions with a description (manual ones), any company.
  const adj = await prisma.transaction.findMany({
    where: { type: 'ADJUSTMENT' as any, description: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      studentId: true,
      amount: true,
      reversedAt: true,
      createdAt: true,
      description: true,
      performedById: true,
      companyId: true,
    },
  });

  console.log(`Jami izohli ADJUSTMENT: ${adj.length} ta. Tahlil...\n`);

  type Row = {
    sid: number;
    name: string;
    status: string;
    balance: number;
    amount: number;
    when: string;
    reversed: boolean;
    cited: string[];
    phantom: string[];
    april: string[];
    desc: string;
  };
  const flagged: Row[] = [];

  for (const t of adj) {
    if (t.studentId == null) continue;
    const cited = extractDates(t.description ?? '');
    if (cited.length === 0) continue;

    // student's attendance date set
    const atts = await prisma.attendance.findMany({
      where: { studentId: t.studentId },
      select: { date: true },
    });
    const attSet = new Set(atts.map((a) => a.date.toISOString().slice(0, 10)));

    const phantom = cited.filter((c) => !attSet.has(c));
    const april = cited.filter((c) => c < MAY1);

    // Flag: a debit (amount<0) adjustment that cites April dates OR phantom dates.
    const isDebit = t.amount < 0;
    if (isDebit && (april.length > 0 || phantom.length > 0)) {
      const s = await prisma.student.findUnique({
        where: { id: t.studentId },
        select: { firstName: true, lastName: true, status: true, balance: true },
      });
      flagged.push({
        sid: t.studentId,
        name: s ? `${s.firstName} ${s.lastName}` : '?',
        status: s?.status ?? '?',
        balance: s?.balance ?? 0,
        amount: t.amount,
        when: t.createdAt.toISOString().slice(0, 10),
        reversed: !!t.reversedAt,
        cited,
        phantom,
        april,
        desc: (t.description ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
  }

  if (flagged.length === 0) {
    console.log("Hech qanday fantom/aprel manfiy ADJUSTMENT topilmadi.");
    return;
  }

  console.log(`⚠ ${flagged.length} ta shubhali yozuv topildi:\n`);
  for (const r of flagged) {
    console.log(`#${r.sid} ${r.name}  [${r.status}]  balans ${fmt(r.balance)}`);
    console.log(`   ADJUSTMENT ${fmt(r.amount)} so'm  (${r.when})  ${r.reversed ? '— ALLAQACHON REVERSED' : '— AKTIV'}`);
    console.log(`   keltirilgan sanalar : ${r.cited.join(', ')}`);
    if (r.april.length) console.log(`   APREL sanalari      : ${r.april.join(', ')}`);
    if (r.phantom.length) console.log(`   FANTOM (davomatda yo'q): ${r.phantom.join(', ')}`);
    console.log(`   izoh: "${r.desc.slice(0, 160)}${r.desc.length > 160 ? '…' : ''}"`);
    console.log('');
  }

  const activeSum = flagged.filter((r) => !r.reversed).reduce((x, r) => x + r.amount, 0);
  console.log('──────────────────────────────────────────────');
  console.log(`Aktiv (hali reversed bo'lmagan) shubhali yozuvlar: ${flagged.filter((r) => !r.reversed).length} ta`);
  console.log(`Ularning jami summasi (qarzga qo'shilgan): ${fmt(activeSum)} so'm`);
}

run(main);
