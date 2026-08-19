/**
 * build-debt-telegram-report — READ-ONLY. Qarzdorlik bo'yicha Telegram xabarini
 * jonli ma'lumotdan yig'adi va chop etadi. HECH NARSA YUBORMAYDI.
 *
 * Raqamlar `ReportsDebtHistoryService` dan keladi — ya'ni xabar
 * /payments/debt-history sahifasi bilan bir xil manbadan oziqlanadi va ular
 * hech qachon bir-biriga zid raqam ko'rsatmaydi.
 *
 * Ishlatish:
 *   railway run npx ts-node scripts/build-debt-telegram-report.ts                  (chop etadi)
 *   railway run npx ts-node scripts/build-debt-telegram-report.ts --send           (guruhga YUBORADI)
 *   railway run npx ts-node scripts/build-debt-telegram-report.ts Namangan         (boshqa filial)
 *
 * `--send` bo'lmasa hech narsa yuborilmaydi — sukut bo'yicha faqat chop etadi,
 * chunki xabarni ko'rmasdan yuborishdan ko'ra ko'rib yuborish arzonroq.
 *
 * Hisobot BITTA filialga qamrovlangan — sukut bo'yicha Farg'ona. Kompaniya
 * bo'ylab yig'ib, sarlavhaga filial nomini yozib qo'yish xato bo'lardi: ikkinchi
 * filial ishga tushgan kuni yorliq yolg'onga aylanardi va buni hech kim
 * sezmasdi. Shu sababli qamrov `getDebtHistory` ga uzatiladi va tanlangan
 * filial har doim chop etiladi.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ReportsDebtHistoryService } from '../src/reports/reports-debt-history.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PAGE_URL = 'https://admin.dafzentrum.uz/payments/debt-history';

/** Sukut bo'yicha filial. Argument bilan almashtiriladi. */
const DEFAULT_BRANCH = "Farg'ona";

/** Apostrof va registr farqi filial nomini topishga to'sqinlik qilmasin. */
const norm = (v: string) =>
  v.toLowerCase().replace(/['`\u2018\u2019\u02bb]/g, '').replace(/\s+/g, ' ').trim();

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} so'm`;
const num = (n: number) => Math.round(n).toLocaleString('ru-RU');
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STATUS_ICON: Record<string, string> = {
  ACTIVE: '🟢',
  FROZEN: '🟣',
  EXPELLED: '🔴',
  GRADUATED: '🔵',
  ARCHIVED_SOFT: '⚪️',
  INACTIVE: '🟡',
};

async function main() {
  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  });
  const svc = new ReportsDebtHistoryService(prisma as never);

  // Qamrov: bitta filial. Nomi bo'yicha topiladi, topilmasa TO'XTAYMIZ —
  // jimgina kompaniya bo'ylab hisoblab, sarlavhaga filial nomini yozish eng
  // yomon natija bo'lardi.
  const args = process.argv.slice(2).filter((a) => a !== '--send');
  const shouldSend = process.argv.includes('--send');
  const wanted = args[0] ?? DEFAULT_BRANCH;
  const branches = await prisma.branch.findMany({
    where: { companyId: company!.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const branch = branches.find((b) => norm(b.name).includes(norm(wanted)));
  if (!branch) {
    throw new Error(
      `"${wanted}" filiali topilmadi. Mavjudlari: ${branches.map((b) => b.name).join(', ')}`,
    );
  }

  const d = await svc.getDebtHistory(company!.id, [branch.id]);

  const today = new Date(Date.now() + 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .split('-')
    .reverse()
    .join('.');

  const lines: string[] = [];

  lines.push(`💸 <b>Qarzdorlik hisoboti — ${today}</b>`);
  lines.push(`<i>${esc(company!.name)} · ${esc(branch.name)}</i>`);
  lines.push('');

  // ── Bugungi holat ──
  // Oldingi oy oxiriga nisbatan o'sish qatori bor edi va olib tashlandi: u
  // bugungi qarzning ICHIDAGI qism edi, lekin yonma-yon turgani uchun qo'shib
  // o'qilardi. Bitta raqam bitta narsani anglatgani ma'qul.
  lines.push('📌 <b>Bugungi holat</b>');
  lines.push(
    `• Jami qarz: <b>${sum(d.current.debt)}</b> — <b>${num(d.current.debtorCount)}</b> ta o'quvchida`,
  );
  lines.push('');

  // ── Kimning qarzi ──
  lines.push('👥 <b>Kimning qarzi</b>');
  for (const s of d.current.byStatus) {
    lines.push(
      `${STATUS_ICON[s.status] ?? '•'} ${esc(s.label)}: <b>${sum(s.amount)}</b> — ${num(s.count)} ta (${s.share}%)`,
    );
  }
  // Bitta jumla bilan xulosa — bu ro'yxatdagi eng muhim narsa.
  const hard = d.current.byStatus
    .filter((s) => s.status !== 'ACTIVE')
    .reduce((a, s) => a + s.amount, 0);
  const hardPct = d.current.debt
    ? Math.round((hard / d.current.debt) * 100)
    : 0;
  if (hardPct > 0) {
    lines.push(
      `⚠️ Qarzning <b>${hardPct}%</b> i o'qimayotgan o'quvchilarda — undirish qiyin.`,
    );
  }
  lines.push('');

  // ── Qaysi oydan qolgan ──
  lines.push('📅 <b>Qaysi oydan qolgan</b>');
  for (const m of d.months) {
    if (m.monthUnpaid <= 0) continue;
    lines.push(
      `• ${esc(m.label)}: <b>${sum(m.monthUnpaid)}</b> — ${num(m.agedDebtorCount)} ta (${m.agedShare}%)`,
    );
  }
  const oldest = d.months.find((m) => m.monthUnpaid > 0);
  if (oldest && !oldest.isCurrent) {
    lines.push(
      `<i>Eng eski qarz — ${esc(oldest.label)}, hali ${sum(oldest.monthUnpaid)} yopilmagan.</i>`,
    );
  }
  lines.push('');

  // ── Eng uzoq qarzdorlar ──
  const top = d.longestDebtors.slice(0, 5);
  if (top.length) {
    lines.push('🔻 <b>Eng uzoq qarzdorlar</b>');
    top.forEach((x, i) => {
      const name = esc(`${x.firstName} ${x.lastName}`.trim());
      const age = x.monthsInDebt === 0 ? 'shu oyda' : `${x.monthsInDebt} oy`;
      lines.push(
        `${i + 1}. ${name} — <b>${sum(x.debt)}</b> (${age}${x.status !== 'ACTIVE' ? ', o\'qimayapti' : ''})`,
      );
    });
    lines.push('');
  }

  lines.push(`🔗 <a href="${PAGE_URL}">Batafsil — oylik qarzdorlik</a>`);

  const message = lines.join('\n');
  console.log(message);
  console.log('\n' + '─'.repeat(60));
  console.log(`Belgilar soni: ${message.length} (Telegram chegarasi: 4096)`);
  console.log(`Qamrov: ${branch.name} (#${branch.id}) — faqat shu filial.`);

  if (!shouldSend) {
    console.log('\nYuborilmadi. Yuborish uchun: --send');
    await prisma.$disconnect();
    return;
  }

  // Nishon: shu filialning FAOL guruhi. Filialsiz yoki o'chirilgan guruhga
  // moliyaviy xabar yuborilmaydi — noto'g'ri guruhga ketgan raqamni ortga
  // qaytarib bo'lmaydi.
  const group = await prisma.telegramGroup.findFirst({
    where: {
      companyId: company!.id,
      branchId: branch.id,
      status: 'APPROVED',
      isActive: true,
      deletedAt: null,
    },
    select: { chatId: true, title: true },
  });
  if (!group) {
    throw new Error(
      `${branch.name} uchun faol Telegram guruhi topilmadi — yuborilmadi.`,
    );
  }

  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_ADMIN_BOT_TOKEN yo`q — yuborilmadi.');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: group.chatId.toString(),
      text: message,
      parse_mode: 'HTML',
      // Havola sahifaga olib boradi, lekin katta oldindan ko'rish kartasi
      // xabarni ikki barobar uzun qilib yuboradi.
      disable_web_page_preview: true,
    }),
  });
  const body = (await res.json()) as { ok: boolean; description?: string };
  if (!body.ok) {
    throw new Error(`Telegram rad etdi: ${body.description ?? res.status}`);
  }
  console.log(`\n✅ Yuborildi → ${group.title} (chatId ${group.chatId})`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
