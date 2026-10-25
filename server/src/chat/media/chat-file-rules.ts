import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  FILE_TYPE_MESSAGE,
  VOICE_LIMIT_MESSAGE,
  checkTaskFile,
} from '../../tasks/task-file-rules';

export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CHAT_VOICE_BYTES = 2 * 1024 * 1024;
export const MAX_CHAT_VOICE_SECONDS = 120;

export const CHAT_FILE_TYPE_MESSAGE =
  'Faqat rasm (JPG, PNG, WebP) va ovozli xabar yuborish mumkin';
export const CHAT_IMAGE_SIZE_MESSAGE = 'Rasm hajmi 5 MB dan oshmasligi kerak';
export const CHAT_VOICE_LIMIT_MESSAGE =
  'Ovozli xabar 2 daqiqadan oshmasligi kerak';

export interface ChatFileCheck {
  mime: string;
  ext: string;
  kind: 'IMAGE' | 'VOICE';
}

/**
 * What a chat file may be. The bytes decide the type (`checkTaskFile` is the
 * one sniffer in the repo); chat then keeps only images and voice, with its
 * own, stricter limits.
 */
export function checkChatFile(input: {
  buffer: Buffer;
  durationSec?: number;
}): ChatFileCheck {
  let checked: ReturnType<typeof checkTaskFile>;
  try {
    checked = checkTaskFile({
      buffer: input.buffer,
      durationSec: input.durationSec,
    });
  } catch (err) {
    if (
      err instanceof BadRequestException &&
      err.message === FILE_TYPE_MESSAGE
    ) {
      throw new BadRequestException(CHAT_FILE_TYPE_MESSAGE);
    }
    // task rules allow 3 minutes and 2 MB of voice; chat's own limits apply below
    if (
      err instanceof BadRequestException &&
      err.message === VOICE_LIMIT_MESSAGE
    ) {
      throw new BadRequestException(CHAT_VOICE_LIMIT_MESSAGE);
    }
    throw err;
  }
  const { mime, ext, kind } = checked;
  if (kind === 'IMAGE') {
    if (input.buffer.length > MAX_CHAT_IMAGE_BYTES) {
      throw new BadRequestException(CHAT_IMAGE_SIZE_MESSAGE);
    }
    return { mime, ext, kind };
  }
  if (kind === 'VOICE') {
    if (
      input.buffer.length > MAX_CHAT_VOICE_BYTES ||
      (input.durationSec ?? 0) > MAX_CHAT_VOICE_SECONDS
    ) {
      throw new BadRequestException(CHAT_VOICE_LIMIT_MESSAGE);
    }
    return { mime, ext, kind };
  }
  throw new BadRequestException(CHAT_FILE_TYPE_MESSAGE);
}

export function chatFileKey(
  companyId: number,
  conversationId: string,
  ext: string,
): string {
  return `chat/${companyId}/${conversationId}/${randomUUID()}${ext}`;
}
