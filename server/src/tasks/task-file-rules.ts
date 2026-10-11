import { BadRequestException } from '@nestjs/common';
import type { TaskFileKind } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * What a task file may be (spec 2026-10-07 §3.5, ADR-0086). Pure: the
 * service and the Telegram replies both check through `checkTaskFile`.
 * The type comes from the BYTES, never from the name or the declared type
 * (the rule of `upload/upload.constraints.ts`): a renamed `.html` is refused.
 */
export const MAX_TASK_FILE_BYTES = 20 * 1024 * 1024; // Telegram's getFile limit too
export const MAX_VOICE_SECONDS = 180;
/** ≈ 5 minutes of the website recorder's 48 kbit/s: the guard a client-declared duration cannot be. */
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 600;
export const PURGE_AFTER_DAYS = 30;
export const PURGE_BATCH = 500;

export const FILE_TYPE_MESSAGE =
  'Faqat JPG, PNG, WebP, PDF, DOCX, XLSX, MP4 fayllar va ovozli xabar qabul qilinadi';
export const FILE_SIZE_MESSAGE = 'Fayl hajmi 20 MB dan oshmasligi kerak';
export const VOICE_LIMIT_MESSAGE = 'Ovozli xabar 3 daqiqadan oshmasligi kerak';
export const EMPTY_FILE_MESSAGE = "Fayl bo'sh";
export const FILES_OFF_MESSAGE = "Fayllar hozircha o'chiq";
export const DELETE_REFUSED_MESSAGE =
  "Faylni faqat qo'shgan odam yoki beruvchi o'chiradi";
export const FILE_NOT_FOUND_MESSAGE = 'Fayl topilmadi';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const TASK_FILE_TYPES: Readonly<
  Record<string, { ext: string; kind: TaskFileKind }>
> = {
  'image/jpeg': { ext: '.jpg', kind: 'IMAGE' },
  'image/png': { ext: '.png', kind: 'IMAGE' },
  'image/webp': { ext: '.webp', kind: 'IMAGE' },
  'application/pdf': { ext: '.pdf', kind: 'DOCUMENT' },
  [DOCX]: { ext: '.docx', kind: 'DOCUMENT' },
  [XLSX]: { ext: '.xlsx', kind: 'DOCUMENT' },
  'video/mp4': { ext: '.mp4', kind: 'DOCUMENT' },
  'audio/ogg': { ext: '.ogg', kind: 'VOICE' },
  'audio/webm': { ext: '.webm', kind: 'VOICE' },
};

/** `ftyp` brands of a video. Anything else in the box is not taken for one. */
const VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'mmp4',
  'dash',
  'qt  ',
]);
/** Photos (HEIC/HEIF, AVIF) and audio (M4A) share the box: refused, even beside a video brand. */
const REFUSED_BRANDS = new Set([
  'heic',
  'heix',
  'mif1',
  'msf1',
  'avif',
  'avis',
  'M4A ',
]);

/**
 * ISO-BMFF: size(4) "ftyp"(4) major(4) minor(4) compatible brands(4 each) up
 * to the box size. A refused brand anywhere wins; else a video major brand or,
 * with an unknown major, a video compatible brand makes it a video.
 */
function isVideoFtyp(b: Buffer): boolean {
  if (b.length < 12) return false;
  const size = b.readUInt32BE(0);
  // size 0 (to the end) and 1 (64-bit) are not read further: major brand only.
  const end = size >= 16 ? Math.min(size, b.length) : 16;
  const brands = [b.toString('latin1', 8, 12)];
  for (let i = 16; i + 4 <= end; i += 4) {
    brands.push(b.toString('latin1', i, i + 4));
  }
  if (brands.some((x) => REFUSED_BRANDS.has(x))) return false;
  return brands.some((x) => VIDEO_BRANDS.has(x));
}

/**
 * OOXML is a zip. Names are read from the LOCAL FILE HEADERS (`PK\3\4`, name
 * length at +26, name at +30): a docx has `[Content_Types].xml` and `word/…`,
 * an xlsx the same with `xl/…`; any other zip, or both, is refused.
 * ponytail: signatures are searched, not walked; a stray `PK\3\4` inside
 * compressed data can only add a bogus name, never hide a real one.
 */
function zipOfficeMime(b: Buffer): string | null {
  const sig = Buffer.from('504b0304', 'hex');
  let contentTypes = false;
  let word = false;
  let xl = false;
  for (let i = b.indexOf(sig); i !== -1; i = b.indexOf(sig, i + 4)) {
    if (i + 30 > b.length) break;
    const end = i + 30 + b.readUInt16LE(i + 26);
    if (end > b.length) continue;
    const name = b.toString('latin1', i + 30, end);
    if (name === '[Content_Types].xml') contentTypes = true;
    else if (name.startsWith('word/')) word = true;
    else if (name.startsWith('xl/')) xl = true;
  }
  if (!contentTypes || word === xl) return null;
  return word ? DOCX : XLSX;
}

/** Magic bytes → type; null for anything not allowed. */
export function sniffMime(b: Buffer): string | null {
  const hexAt = (off: number, hex: string) =>
    b.length >= off + hex.length / 2 &&
    b.subarray(off, off + hex.length / 2).toString('hex') === hex;
  const textAt = (off: number, s: string) =>
    b.length >= off + s.length &&
    b.subarray(off, off + s.length).toString('latin1') === s;
  if (hexAt(0, 'ffd8ff')) return 'image/jpeg';
  if (hexAt(0, '89504e470d0a1a0a')) return 'image/png';
  if (textAt(0, 'RIFF') && textAt(8, 'WEBP')) return 'image/webp';
  if (textAt(0, '%PDF-')) return 'application/pdf';
  if (textAt(0, 'OggS')) return 'audio/ogg';
  // EBML: webm says so in its doctype within the first bytes; other matroska is refused.
  if (hexAt(0, '1a45dfa3')) {
    return b.subarray(0, 64).includes('webm') ? 'audio/webm' : null;
  }
  if (textAt(4, 'ftyp')) return isVideoFtyp(b) ? 'video/mp4' : null;
  if (hexAt(0, '504b0304')) return zipOfficeMime(b);
  return null;
}

export function checkTaskFile(input: {
  buffer: Buffer;
  durationSec?: number;
}): { mime: string; ext: string; kind: TaskFileKind } {
  const { buffer, durationSec } = input;
  if (buffer.length === 0) throw new BadRequestException(EMPTY_FILE_MESSAGE);
  if (buffer.length > MAX_TASK_FILE_BYTES) {
    throw new BadRequestException(FILE_SIZE_MESSAGE);
  }
  const mime = sniffMime(buffer);
  const type = mime ? TASK_FILE_TYPES[mime] : undefined;
  if (!mime || !type) throw new BadRequestException(FILE_TYPE_MESSAGE);
  if (
    type.kind === 'VOICE' &&
    (buffer.length > MAX_VOICE_BYTES || (durationSec ?? 0) > MAX_VOICE_SECONDS)
  ) {
    throw new BadRequestException(VOICE_LIMIT_MESSAGE);
  }
  return { mime, ext: type.ext, kind: type.kind };
}

const NAME_MAX = 120;

/** The base name the person gave, cleaned, with the extension of the real type. */
export function safeFileName(raw: string | undefined, ext: string): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .trim();
  const clipped = Array.from(cleaned).slice(0, NAME_MAX).join('');
  return `${clipped || 'fayl'}${ext}`;
}

export function taskFileKey(
  companyId: number,
  taskId: string,
  ext: string,
): string {
  return `tasks/${companyId}/${taskId}/${randomUUID()}${ext}`;
}

/** RFC 6266 / 5987: an ASCII fallback plus the exact UTF-8 name. */
export function contentDisposition(name: string, download: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** Spec §3.2: a photo counts from the last return, or from the creation. */
export function freshPhotoSince(task: {
  createdAt: Date;
  lastReturnedAt: Date | null;
}): Date {
  return task.lastReturnedAt ?? task.createdAt;
}
