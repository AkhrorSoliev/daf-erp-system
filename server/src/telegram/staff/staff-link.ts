import type { EntityHistoryService } from '../../common/entity-history';
import {
  signInStaffWhere,
  staffPortalFor,
} from '../../common/auth/staff-telegram';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StaffAccount } from './staff-cabinet';

export type StaffLinkResult =
  | {
      kind: 'linked';
      account: StaffAccount;
      /** Hisob avval bog'langan boshqa chat — uning «Kabinet» tugmasi qaytariladi. */
      previousChatId: string | null;
    }
  | { kind: 'not_found' }
  | { kind: 'ambiguous' };

/**
 * Xodimning Telegram'ini uning hisobiga bog'laydi (ADR-0045).
 *
 * Isbot — odamning O'Z Telegram raqami (kontakt tugmasi, `user_id` yuboruvchi
 * bilan teng — chaqiruvchi tekshiradi) hisobdagi telefonga teng. Telegram OAuth
 * kirishi ham xodimni aynan shu isbot bilan parolsiz kiritadi, ya'ni bu
 * bog'lanish mavjud eshikdan kengroq emas.
 *
 * - Faqat tizimga kira oladigan xodim hisobi (Mini App kirishining sharti).
 * - Raqam bir nechta xodim hisobida bo'lsa — yopiq holat: qaysi biri
 *   ekanini bilib bo'lmaydi.
 * - Bitta Telegram — bitta xodim hisobi: chat boshqa hisobga bog'langan
 *   bo'lsa, o'sha bog'lanish olib tashlanadi (ikki hisobli chatni Mini App rad
 *   etadi). Hisob boshqa chatga bog'langan bo'lsa — yangi chatga o'tadi:
 *   raqamning hozirgi egasi o'sha.
 *
 * Har o'zgarish tarixga yoziladi, bajaruvchi — xodimning o'zi.
 */
export async function linkStaffChatByPhone(
  prisma: Pick<PrismaService, 'user' | '$transaction'>,
  history: Pick<EntityHistoryService, 'recordUpdate'>,
  chatId: string,
  phone: string,
): Promise<StaffLinkResult> {
  const matches = await prisma.user.findMany({
    where: { ...signInStaffWhere(), phone },
    select: {
      id: true,
      firstName: true,
      companyId: true,
      telegramChatId: true,
      roles: { select: { roleId: true } },
    },
    orderBy: { id: 'asc' },
    take: 2,
  });
  if (matches.length > 1) return { kind: 'ambiguous' };
  const [target] = matches;
  const roleIds = target?.roles.map((r) => r.roleId) ?? [];
  const portal = staffPortalFor(roleIds);
  if (!target || !portal) return { kind: 'not_found' };

  await prisma.$transaction(async (tx) => {
    const others = await tx.user.findMany({
      where: {
        telegramChatId: chatId,
        deletedAt: null,
        id: { not: target.id },
      },
      select: { id: true, companyId: true },
    });
    for (const other of others) {
      await tx.user.update({
        where: { id: other.id },
        data: { telegramChatId: null },
      });
      await history.recordUpdate({
        entityType: 'User',
        entityId: other.id,
        oldValues: { telegramChatId: chatId },
        newValues: { telegramChatId: null },
        changedById: target.id,
        companyId: other.companyId,
        tx,
      });
    }

    if (target.telegramChatId !== chatId) {
      await tx.user.update({
        where: { id: target.id },
        data: { telegramChatId: chatId },
      });
      await history.recordUpdate({
        entityType: 'User',
        entityId: target.id,
        oldValues: { telegramChatId: target.telegramChatId },
        newValues: { telegramChatId: chatId },
        changedById: target.id,
        companyId: target.companyId,
        tx,
      });
    }
  });

  const previousChatId =
    target.telegramChatId && target.telegramChatId !== chatId
      ? target.telegramChatId
      : null;
  return {
    kind: 'linked',
    account: { id: target.id, firstName: target.firstName, roleIds, portal },
    previousChatId,
  };
}
