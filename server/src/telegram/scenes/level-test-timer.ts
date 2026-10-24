import type { Update } from 'telegraf/types';

/**
 * Taymerni sahnaga yetkazish: `delayMs` dan keyin `ltt:<counter>` (vaqt tugadi)
 * yoki `ltk:<counter>` (qolgan vaqtni yangilash) yuboriladi.
 */
export interface LevelTestTimeoutJob {
  chatId: number;
  counter: number;
  messageId: number;
  delayMs: number;
  action: 'timeout' | 'tick';
}

export interface LevelTestTiming {
  now?: () => number;
  schedule?: (job: LevelTestTimeoutJob) => void;
}

/**
 * Savol vaqti tugaganda botning O'ZI yuboradigan yangilanish. Telegram taymer
 * bermaydi, shuning uchun bu — `ltt:<counter>` tugmasi bosilgandek ko'rinadigan
 * ichki yangilanish: u sessiya va sahna middleware'laridan odatdagi yo'l bilan
 * o'tadi (sessiya jonli obyekt sifatida bo'lishilgani uchun poyga yo'q).
 * Foydalanuvchi bunday tugmani ko'rmaydi; sahna baribir muddat o'tganini
 * o'zi tekshiradi.
 */
export function levelTestTimeoutUpdate(
  chatId: number,
  counter: number,
  messageId: number,
  nowMs: number = Date.now(),
  action: 'timeout' | 'tick' = 'timeout',
): Update {
  return {
    update_id: nowMs,
    callback_query: {
      id: `lt-${action}-${chatId}-${counter}-${nowMs}`,
      chat_instance: 'level-test',
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      message: {
        message_id: messageId,
        date: Math.floor(nowMs / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Test' },
      },
      data: `${action === 'tick' ? 'ltk' : 'ltt'}:${counter}`,
    },
  } as Update;
}
