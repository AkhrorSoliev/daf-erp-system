import type { PrismaService } from '../../prisma/prisma.service';

type Db = Pick<
  PrismaService,
  | 'student'
  | 'telegramChannelGateEvent'
  | 'levelTestAttempt'
  | 'levelTestInvite'
>;

export interface InviteAudience {
  /** Yuboriladigan chatlar (takrorsiz). */
  chats: string[];
  students: number;
  others: number;
}

/**
 * Taklif kimga boradi (ADR-0126):
 *  - hamma holatdagi o'quvchilar (faol, muzlatilgan, chetlatilgan, bitirgan),
 *    karta o'chirilmagan va bot yeta oladigan chat (`telegramDisconnectedAt` null);
 *  - kanal tekshiruvidagi odamlar, agar o'quvchi chatlaridan biri bo'lmasa
 *    (bloklagan o'quvchining chati ham shu yerga tushmaydi).
 * Testni allaqachon boshlagan va taklif olgan chatlar chiqarib tashlanadi.
 * Xodimlar kirmaydi.
 */
export async function loadInviteAudience(db: Db): Promise<InviteAudience> {
  const [students, gate, attempts, invited] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null, telegramChatId: { not: null } },
      select: { telegramChatId: true, telegramDisconnectedAt: true },
    }),
    db.telegramChannelGateEvent.findMany({ select: { telegramUserId: true } }),
    db.levelTestAttempt.findMany({ select: { chatId: true } }),
    db.levelTestInvite.findMany({ select: { chatId: true } }),
  ]);

  const skip = new Set<string>([
    ...attempts.map((a) => a.chatId),
    ...invited.map((i) => i.chatId),
  ]);
  const allStudentChats = new Set<string>();
  const studentChats = new Set<string>();
  for (const s of students) {
    const chat = s.telegramChatId as string;
    allStudentChats.add(chat);
    if (s.telegramDisconnectedAt === null && !skip.has(chat)) {
      studentChats.add(chat);
    }
  }
  const otherChats = new Set<string>();
  for (const g of gate) {
    const chat = g.telegramUserId;
    if (!allStudentChats.has(chat) && !skip.has(chat)) otherChats.add(chat);
  }
  return {
    chats: [...studentChats, ...otherChats],
    students: studentChats.size,
    others: otherChats.size,
  };
}
