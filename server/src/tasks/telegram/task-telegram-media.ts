import type { Message } from 'telegraf/types';
import {
  FILE_SIZE_MESSAGE,
  MAX_TASK_FILE_BYTES,
  MAX_VOICE_SECONDS,
  VOICE_LIMIT_MESSAGE,
} from '../task-file-rules';

export const UNSUPPORTED_MEDIA =
  'Bu turdagi xabar qabul qilinmaydi: matn, rasm, hujjat, video yoki ovozli xabar yuboring.';

/** What the bot downloads (`getFile`); the service reads the type from the bytes. */
export interface TgAttachment {
  fileId: string;
  name: string;
  durationSec?: number;
}

/**
 * The file in a reply (spec §6.2), refused early when Telegram already says it
 * is too big or too long — nothing is downloaded then. null = a text message.
 */
export function pickAttachment(
  msg: Message,
): TgAttachment | { refused: string } | null {
  const big = (size?: number) => (size ?? 0) > MAX_TASK_FILE_BYTES;
  if ('photo' in msg && msg.photo.length) {
    const p = msg.photo[msg.photo.length - 1];
    return big(p.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: p.file_id, name: 'rasm.jpg' };
  }
  if ('document' in msg) {
    const d = msg.document;
    return big(d.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: d.file_id, name: d.file_name ?? 'fayl' };
  }
  if ('video' in msg) {
    const v = msg.video;
    return big(v.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : { fileId: v.file_id, name: v.file_name ?? 'video.mp4' };
  }
  if ('voice' in msg) {
    const v = msg.voice;
    if (v.duration > MAX_VOICE_SECONDS) return { refused: VOICE_LIMIT_MESSAGE };
    return big(v.file_size)
      ? { refused: FILE_SIZE_MESSAGE }
      : {
          fileId: v.file_id,
          name: 'ovozli-xabar.ogg',
          durationSec: v.duration,
        };
  }
  if ('text' in msg) return null;
  return { refused: UNSUPPORTED_MEDIA };
}
