import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  MAX_CHAT_IMAGE_BYTES,
  CHAT_IMAGE_SIZE_MESSAGE,
} from './chat-file-rules';

/** One file plus one short text field (`durationSec`); the bytes are read into memory. */
export const CHAT_UPLOAD_LIMITS = {
  fileSize: MAX_CHAT_IMAGE_BYTES,
  files: 1,
  fields: 1,
  fieldSize: 64,
  parts: 3, // the file, the field and the closing boundary
} as const;

export const CHAT_UPLOAD_REFUSED_MESSAGE = 'Fayl yuklanmadi';

export function chatUploadError(err: unknown): unknown {
  if (err instanceof PayloadTooLargeException) {
    return new BadRequestException(CHAT_IMAGE_SIZE_MESSAGE);
  }
  if (err instanceof BadRequestException) {
    return new BadRequestException(CHAT_UPLOAD_REFUSED_MESSAGE);
  }
  return err;
}

@Injectable()
export class ChatFileUploadInterceptor implements NestInterceptor {
  private readonly inner = new (FileInterceptor('file', {
    storage: memoryStorage(),
    limits: CHAT_UPLOAD_LIMITS,
  }))();

  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await this.inner.intercept(context, next);
    } catch (err) {
      throw chatUploadError(err);
    }
  }
}
