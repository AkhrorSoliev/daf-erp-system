/**
 * Interim CLI: list pending Telegram groups (the bot auto-creates these when
 * added to a chat) and approve one to a company. Replaces the admin-panel UI
 * until Phase 5 ships it.
 *
 * Usage:
 *   List pending:
 *     npx ts-node scripts/approve-tg-group.ts
 *
 *   Approve a pending group:
 *     npx ts-node scripts/approve-tg-group.ts <pendingId> <approverUserId> [branchId]
 */
import { PrismaClient, TelegramGroupStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

async function main() {
  const [, , pendingId, approverUserIdArg, branchIdArg] = process.argv;

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    if (!pendingId) {
      const pending = await prisma.telegramGroup.findMany({
        where: { status: TelegramGroupStatus.PENDING, deletedAt: null },
        orderBy: { addedAt: 'desc' },
      });
      if (pending.length === 0) {
        console.log('\n(Tasdiqlash kutilayotgan guruh yo\'q)\n');
        console.log(
          "Botni Telegram guruhga qo'shing — bot avtomatik PENDING qator yaratadi.\n",
        );
        return;
      }
      console.log('\n=== Tasdiqlash kutilayotgan guruhlar ===\n');
      for (const g of pending) {
        console.log(
          `  id=${g.id}\n` +
            `  chatId=${g.chatId.toString()}\n` +
            `  title="${g.title}"\n` +
            `  addedBy=${g.addedByTelegramUserId?.toString() ?? '—'}\n` +
            `  addedAt=${g.addedAt.toISOString()}\n`,
        );
      }
      console.log('Tasdiqlash uchun:');
      console.log(
        `  npx ts-node scripts/approve-tg-group.ts <id> <approverUserId> [branchId]\n`,
      );
      return;
    }

    if (!approverUserIdArg) {
      console.error('approverUserId argumenti talab qilinadi');
      console.error('Usage: npx ts-node scripts/approve-tg-group.ts <id> <approverUserId> [branchId]');
      process.exit(1);
    }
    const approverUserId = Number(approverUserIdArg);
    const branchId = branchIdArg ? Number(branchIdArg) : null;

    const approver = await prisma.user.findFirst({
      where: { id: approverUserId, deletedAt: null },
      include: {
        company: { select: { id: true, name: true } },
        roles: { include: { role: { select: { name: true } } } },
      },
    });
    if (!approver) {
      console.error(`User id=${approverUserId} topilmadi`);
      process.exit(1);
    }
    const roleNames = approver.roles.map((r) => r.role.name);
    const isAllowed =
      roleNames.includes('CEO') || roleNames.includes('Branch Director');
    if (!isAllowed) {
      console.error(
        `User id=${approverUserId} (${approver.firstName} ${approver.lastName}) — faqat CEO yoki Branch Director tasdiqlay oladi.`,
      );
      process.exit(1);
    }

    const group = await prisma.telegramGroup.findUnique({
      where: { id: pendingId },
    });
    if (!group || group.deletedAt) {
      console.error(`Guruh id=${pendingId} topilmadi`);
      process.exit(1);
    }
    if (group.status === TelegramGroupStatus.APPROVED) {
      console.error(
        `Guruh allaqachon tasdiqlangan (companyId=${group.companyId})`,
      );
      process.exit(1);
    }

    const updated = await prisma.telegramGroup.update({
      where: { id: pendingId },
      data: {
        status: TelegramGroupStatus.APPROVED,
        companyId: approver.companyId,
        branchId,
        approvedById: approver.id,
        approvedAt: new Date(),
        isActive: true,
      },
    });

    console.log(`\n✅ Tasdiqlandi:\n`);
    console.log(`  Guruh: "${updated.title}" (chatId=${updated.chatId.toString()})`);
    console.log(`  Kompaniya: ${approver.company.name} (id=${approver.companyId})`);
    console.log(`  Filial: ${branchId ?? '—'}`);
    console.log(`  Tasdiqlovchi: ${approver.firstName} ${approver.lastName}`);
    console.log(
      `\n⚠️  Diqqat: bot guruhga tasdiqlash xabarini yuborish uchun server qayta ishga tushishi kerak (yoki kuting — keyingi xabar API orqali tasdiqlanganda yuboriladi).\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
