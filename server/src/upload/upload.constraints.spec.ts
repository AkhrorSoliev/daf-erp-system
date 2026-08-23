import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
  assertUploadableImage,
} from './upload.constraints';

/**
 * These rules used to live only in `UploadController`'s multer options, so
 * they applied to exactly one of the five ways a file reaches R2. The bucket
 * is public, so what lands in it is served from the centre's own domain.
 */
describe('assertUploadableImage', () => {
  const jpeg = { mimetype: 'image/jpeg', size: 1024 };

  it('accepts the three image types and returns the extension for each', () => {
    expect(assertUploadableImage({ mimetype: 'image/jpeg', size: 1 })).toBe(
      '.jpg',
    );
    expect(assertUploadableImage({ mimetype: 'image/png', size: 1 })).toBe(
      '.png',
    );
    expect(assertUploadableImage({ mimetype: 'image/webp', size: 1 })).toBe(
      '.webp',
    );
  });

  it('derives the extension from the type, never from the filename', () => {
    // The regression: the key used `extname(file.originalname)` verbatim, so
    // a client could declare `image/png` and still land `.html` in a public
    // bucket. The filename is not even an input here any more.
    expect(
      assertUploadableImage({
        mimetype: 'image/png',
        size: 1,

        ...({ originalname: 'payload.html' } as any),
      }),
    ).toBe('.png');
  });

  it.each([
    'text/html',
    'image/svg+xml',
    'application/pdf',
    'application/octet-stream',
  ])('rejects %s', (mimetype) => {
    expect(() => assertUploadableImage({ mimetype, size: 1 })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing type rather than defaulting to one', () => {
    expect(() => assertUploadableImage({ size: 1 })).toThrow(
      BadRequestException,
    );
  });

  it('rejects anything over 5 MB', () => {
    expect(() =>
      assertUploadableImage({ ...jpeg, size: MAX_UPLOAD_BYTES + 1 }),
    ).toThrow(BadRequestException);
    expect(assertUploadableImage({ ...jpeg, size: MAX_UPLOAD_BYTES })).toBe(
      '.jpg',
    );
  });

  it('falls back to the buffer length when size is absent', () => {
    // Callers that build a Multer file by hand may not set `size`; the
    // Telegram scenes are in that shape.
    expect(() =>
      assertUploadableImage({
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
      }),
    ).toThrow(BadRequestException);
  });

  it('keeps the allow-list and the extension map in step', () => {
    for (const mime of ALLOWED_IMAGE_MIMES) {
      expect(assertUploadableImage({ mimetype: mime, size: 1 })).toMatch(/^\./);
    }
  });
});
