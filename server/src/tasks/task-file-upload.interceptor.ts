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
import { FILE_SIZE_MESSAGE, MAX_TASK_FILE_BYTES } from './task-file-rules';

/**
 * One file plus two short text fields (`name`, `durationSec`) and nothing
 * else. The bytes are read into memory (the type is read from them, ADR-0086),
 * so the size limit is also the memory a single request can take.
 */
export const TASK_UPLOAD_LIMITS = {
  fileSize: MAX_TASK_FILE_BYTES,
  files: 1,
  fields: 2,
  fieldSize: 1024,
  // Three real parts (the file and both fields) need 4: busboy raises the parts
  // limit when its counter REACHES the number, and the closing boundary counts.
  parts: 4,
} as const;

/** What the person reads when the multipart body itself is refused. */
export const UPLOAD_REFUSED_BODY_MESSAGE = 'Fayl yuklanmadi';

/**
 * Multer's own errors become a 413 for the size limit and English 400s for
 * the rest. Staff read neither: the size one says «Fayl hajmi 20 MB dan
 * oshmasligi kerak», every other refused body (second file, extra field,
 * wrong field name, cut-off upload) a plain 400.
 */
export function uploadError(err: unknown): unknown {
  if (err instanceof PayloadTooLargeException) {
    return new BadRequestException(FILE_SIZE_MESSAGE);
  }
  if (err instanceof BadRequestException) {
    return new BadRequestException(UPLOAD_REFUSED_BODY_MESSAGE);
  }
  return err;
}

@Injectable()
export class TaskFileUploadInterceptor implements NestInterceptor {
  private readonly inner = new (FileInterceptor('file', {
    storage: memoryStorage(),
    limits: TASK_UPLOAD_LIMITS,
  }))();

  // Only the multipart parse can throw here; the handler's own errors travel
  // inside the returned stream and are never touched.
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await this.inner.intercept(context, next);
    } catch (err) {
      throw uploadError(err);
    }
  }
}
