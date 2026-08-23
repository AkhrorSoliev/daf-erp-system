import { BadRequestException } from '@nestjs/common';

/**
 * What an image upload is allowed to be, in one place.
 *
 * It lived only in `UploadController`'s multer options, which meant it only
 * applied to `POST /upload`. Four other call sites reach `UploadService`
 * directly — the student portal's photo route, two Telegram registration
 * scenes and the student registration flow — and none of them inherited a
 * size limit or a type check. The student portal's route in particular had
 * `FileInterceptor('file')` with no options at all.
 *
 * So the rules live here and the SERVICE enforces them. The controller keeps
 * its multer `fileFilter` as well, because rejecting there avoids buffering a
 * rejected file at all; the service check is what makes the rule true for
 * every caller rather than for one route.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * `mimetype -> extension`. The extension comes from THIS map, never from
 * `file.originalname`: the filename is attacker-supplied, and it used to be
 * appended verbatim to the object key of a public bucket, so `photo.html`
 * became a page served from the centre's own domain.
 */
export const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const ALLOWED_IMAGE_MIMES = Object.keys(ALLOWED_IMAGE_TYPES);

export const UPLOAD_TYPE_MESSAGE =
  'Faqat JPG, PNG yoki WebP formatdagi rasmlar qabul qilinadi';
export const UPLOAD_SIZE_MESSAGE = 'Rasm hajmi 5 MB dan oshmasligi kerak';

/**
 * Validates one uploaded image and returns the extension its type implies.
 * Throws the Uzbek message the UI already expects.
 */
export function assertUploadableImage(file: {
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}): string {
  const ext = file.mimetype ? ALLOWED_IMAGE_TYPES[file.mimetype] : undefined;
  if (!ext) {
    throw new BadRequestException(UPLOAD_TYPE_MESSAGE);
  }
  const size = file.size ?? file.buffer?.length ?? 0;
  if (size > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(UPLOAD_SIZE_MESSAGE);
  }
  return ext;
}
