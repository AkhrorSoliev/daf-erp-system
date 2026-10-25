import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  chatUploadError,
  CHAT_UPLOAD_LIMITS,
} from './chat-file-upload.interceptor';

describe('chat upload', () => {
  it('limits one small file', () => {
    expect(CHAT_UPLOAD_LIMITS).toMatchObject({
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 1,
    });
  });
  it('turns multer errors into Uzbek 400s', () => {
    expect(chatUploadError(new PayloadTooLargeException())).toEqual(
      new BadRequestException('Rasm hajmi 5 MB dan oshmasligi kerak'),
    );
    expect(
      chatUploadError(new BadRequestException('Unexpected field')),
    ).toEqual(new BadRequestException('Fayl yuklanmadi'));
  });
});
