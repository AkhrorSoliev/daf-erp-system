/**
 * close-branchless-cash-accounts — filialsiz (branchId = null) kassa hisoblarini
 * bo'shatib arxivlaydi.
 *
 * NEGA: "umumiy kassa" degan tushuncha xatoni yashiradigan chelak bo'lib
 * qolgan. `recordRefund` / `recordSalaryPayment` filial yubormagani uchun pul
 * jismonan filial sandig'idan chiqqan bo'lsa ham, kitobda umumiy hisobdan
 * chiqqan deb yozilgan. Natijada umumiy hisob faqat chiqim ko'rgan va minusga
 * ketgan (PRODda −1 107 000 so'm), filial kassasi esa o'shancha ortiqcha
 * ko'rinadi. Har filial o'z xarajatini o'zi ko'taradi degan qoida bo'yicha
 * (docs/branch-decisions.md D4) bunday hisob umuman bo'lmasligi kerak.
 *
 * USUL — o'chirish emas, O'TKAZMA. Kassa jurnali append-only: har harakat
 * `balanceBefore`/`balanceAfter` zanjirini saqlaydi va uni orqaga qayta yozish
 * tarixni buzadi. Shuning uchun eski harakatlar joyida qoladi, ularning o'rniga
 * filial kassasidan umumiy hisobga qoplama o'tkazma yoziladi: umumiy hisob
 * nolga chiqadi, filial kassasi esa haqiqatga yaqinlashadi (o'sha pul aslida
 * o'sha sandiqdan chiqqan).
 *
 * Keyin bo'sh (qoldiq = 0) filialsiz hisoblar arxivlanadi.
 *
 * Usage (server/ ichidan):
 *   railway run npx ts-node scripts/close-branchless-cash-accounts.ts --dry-run
 *   railway run npx ts-node scripts/close-branchless-cash-accounts.ts --target-branch 1
 */
import { PrismaClient, CashAccountType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = process.argv.includes('--dry-run');
const tbIdx = process.argv.indexOf('--target-branch');
const TARGET_BRANCH = tbIdx !== -1 ? Number(process.argv[tbIdx + 1]) : 1;

const som = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ');

async function main() {
  console.log(`DB host: ${new URL(connectionString!).host}`);
  console.log(`RAILWAY: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local .env)'}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'} | qoplovchi filial: #${TARGET_BRANCH}\n`);

  const branchless = await prisma.cashAccount.findMany({
    where: { branchId: null, deletedAt: null },
    select: { id: true, name: true, type: true, balance: true, companyId: true },
  });
  if (!branchless.length) {
    console.log("Filialsiz kassa hisobi yo'q — hech narsa qilinmadi.");
    return;
  }

  const backup: Record<string, unknown>[] = [];

  for (const acc of branchless) {
    const movements = await prisma.cashMovement.count({
      where: { cashAccountId: acc.id },
    });
    console.log(
      `\n── ${acc.name} (${acc.type}) — qoldiq ${som(acc.balance)} so'm, ${movements} ta harakat`,
    );

    backup.push({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      balanceBefore: acc.balance,
      movements,
    });

    if (acc.balance === 0) {
      console.log(`   qoldiq nol → o'tkazma kerak emas`);
    } else {
      // The company account is negative because only outflows ever landed on
      // it; the branch account is the same amount too high. Covering it means
      // moving `-balance` FROM the branch TO the company account.
      const amount = -acc.balance;
      if (amount <= 0) {
        console.log(
          `   ⚠️ qoldiq musbat (${som(acc.balance)}) — bu holat kutilmagan, QO'LDA hal qiling`,
        );
        continue;
      }

      const target = await prisma.cashAccount.findFirst({
        where: {
          companyId: acc.companyId,
          branchId: TARGET_BRANCH,
          type: acc.type,
          deletedAt: null,
        },
        select: { id: true, name: true, balance: true },
      });
      if (!target) {
        console.log(
          `   ❌ filial #${TARGET_BRANCH} uchun ${acc.type} hisobi topilmadi — o'tkazib yuborildi`,
        );
        continue;
      }

      console.log(
        `   o'tkazma: ${target.name} → ${acc.name}, ${som(amount)} so'm`,
      );
      console.log(
        `     ${target.name}: ${som(target.balance)} → ${som(target.balance - amount)}`,
      );
      console.log(`     ${acc.name}: ${som(acc.balance)} → 0`);

      if (!DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          const from = await tx.cashAccount.findUniqueOrThrow({
            where: { id: target.id },
            select: { balance: true },
          });
          const to = await tx.cashAccount.findUniqueOrThrow({
            where: { id: acc.id },
            select: { balance: true },
          });
          const note =
            "Filialsiz kassani yopish: chiqimlar aslida filial sandig'idan bo'lgan";

          await tx.cashMovement.create({
            data: {
              cashAccountId: target.id,
              type: 'TRANSFER_OUT',
              amount: -amount,
              balanceBefore: from.balance,
              balanceAfter: from.balance - amount,
              branchId: TARGET_BRANCH,
              companyId: acc.companyId,
              description: note,
            },
          });
          await tx.cashAccount.update({
            where: { id: target.id },
            data: { balance: from.balance - amount },
          });

          await tx.cashMovement.create({
            data: {
              cashAccountId: acc.id,
              type: 'TRANSFER_IN',
              amount,
              balanceBefore: to.balance,
              balanceAfter: to.balance + amount,
              branchId: TARGET_BRANCH,
              companyId: acc.companyId,
              description: note,
            },
          });
          await tx.cashAccount.update({
            where: { id: acc.id },
            data: { balance: to.balance + amount },
          });
        });
        console.log(`   ✅ o'tkazma yozildi`);
      }
    }

    // Archive the now-empty branch-less account.
    if (DRY_RUN) {
      console.log(`   arxivlanadi`);
    } else {
      await prisma.cashAccount.update({
        where: { id: acc.id },
        data: { deletedAt: new Date(), isActive: false },
      });
      console.log(`   ✅ arxivlandi`);
    }
  }

  if (!DRY_RUN) {
    const stamp = new Date().toISOString().slice(0, 10);
    const p = path.join(
      __dirname,
      `close-branchless-cash-accounts-backup-${stamp}.json`,
    );
    fs.writeFileSync(
      p,
      JSON.stringify({ takenAt: new Date().toISOString(), TARGET_BRANCH, accounts: backup }, null, 2),
    );
    console.log(`\nZaxira: ${p}`);
  }

  const left = await prisma.cashAccount.count({
    where: { branchId: null, deletedAt: null },
  });
  console.log(
    `\n${DRY_RUN ? 'DRY RUN — hech narsa yozilmadi.' : `Qolgan filialsiz aktiv hisob: ${left} ta`}`,
  );
}

main()
  .catch((e) => {
    console.error('XATO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
