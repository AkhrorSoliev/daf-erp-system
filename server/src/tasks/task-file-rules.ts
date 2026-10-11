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
  'video/quicktime': { ext: '.mov', kind: 'DOCUMENT' },
  'audio/mp4': { ext: '.m4a', kind: 'VOICE' },
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
/** Photos (HEIC/HEIF, AVIF) share the box: refused, even beside a video brand. */
const PHOTO_BRANDS = new Set(['heic', 'heix', 'mif1', 'msf1', 'avif', 'avis']);
/** Audio-only mp4: Safari / iOS and Android voice recorders. */
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ']);

/** Every scan below is bounded, whatever the sizes a crafted file claims. */
const MAX_FTYP_BRANDS = 64;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_NAME = 1024;
const ZIP_EOCD_WINDOW = 65535 + 22;
const CODEC_WINDOW = 4096;

/**
 * ISO-BMFF: size(4) "ftyp"(4) major(4) minor(4) compatible brands(4 each) up
 * to the box size, at most MAX_FTYP_BRANDS of them. A photo brand anywhere
 * refuses the file; an audio brand makes it a voice note; `qt  ` as the major
 * brand is a QuickTime movie; else a video brand (major, or compatible beside
 * an unknown major) makes it a video.
 */
function ftypMime(b: Buffer): string | null {
  if (b.length < 12) return null;
  const size = b.readUInt32BE(0);
  // size 0 (to the end) and 1 (64-bit) are not read further: major brand only.
  const end = Math.min(
    size >= 16 ? size : 16,
    b.length,
    16 + MAX_FTYP_BRANDS * 4,
  );
  const major = b.toString('latin1', 8, 12);
  const brands = [major];
  for (let i = 16; i + 4 <= end; i += 4) {
    brands.push(b.toString('latin1', i, i + 4));
  }
  if (brands.some((x) => PHOTO_BRANDS.has(x))) return null;
  if (brands.some((x) => AUDIO_BRANDS.has(x))) return 'audio/mp4';
  if (major === 'qt  ') return 'video/quicktime';
  return brands.some((x) => VIDEO_BRANDS.has(x)) ? 'video/mp4' : null;
}

/**
 * OOXML is a zip. Names come from the CENTRAL DIRECTORY (found through the
 * end-of-central-directory record in the last 64 KB), so an archive stored
 * inside the document (a chart's workbook) is never mistaken for its parts.
 * docx = `[Content_Types].xml` + `word/document.xml`, xlsx = the same with
 * `xl/workbook.xml`; any other zip, or both, is refused.
 */
function zipOfficeMime(b: Buffer): string | null {
  const eocdSig = Buffer.from('504b0506', 'hex');
  const windowStart = Math.max(0, b.length - ZIP_EOCD_WINDOW);
  let eocd = -1;
  for (let i = b.lastIndexOf(eocdSig); i >= windowStart; ) {
    // the record ends exactly where the file does (after its comment)
    if (i + 22 <= b.length && i + 22 + b.readUInt16LE(i + 20) === b.length) {
      eocd = i;
      break;
    }
    i = i === 0 ? -1 : b.lastIndexOf(eocdSig, i - 1);
  }
  if (eocd < 0) return null;
  const count = Math.min(b.readUInt16LE(eocd + 10), MAX_ZIP_ENTRIES);
  let pos = b.readUInt32LE(eocd + 16);
  let contentTypes = false;
  let document = false;
  let workbook = false;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > b.length || b.readUInt32LE(pos) !== 0x02014b50) break;
    const nameLen = b.readUInt16LE(pos + 28);
    const nameEnd = pos + 46 + nameLen;
    if (nameEnd > b.length) break;
    if (nameLen <= MAX_ZIP_NAME) {
      const name = b.toString('latin1', pos + 46, nameEnd);
      if (name === '[Content_Types].xml') contentTypes = true;
      else if (name === 'word/document.xml') document = true;
      else if (name === 'xl/workbook.xml') workbook = true;
    }
    pos = nameEnd + b.readUInt16LE(pos + 30) + b.readUInt16LE(pos + 32);
  }
  if (!contentTypes || document === workbook) return null;
  return document ? DOCX : XLSX;
}

/** Ogg carries audio when its first packet is a known audio codec; theora and the rest are refused. */
function oggMime(b: Buffer): string | null {
  const head = b.subarray(0, 128);
  const audio = ['OpusHead', '\x01vorbis', 'Speex   ', '\x7fFLAC'];
  return audio.some((c) => head.includes(c)) ? 'audio/ogg' : null;
}

/** EBML: "webm" doctype, then an audio codec and no video codec in the first tracks. */
function webmMime(b: Buffer): string | null {
  if (!b.subarray(0, 64).includes('webm')) return null;
  const head = b.toString('latin1', 0, CODEC_WINDOW);
  if (/V_(VP8|VP9|AV1|MPEG)/.test(head)) return null;
  return /A_(OPUS|VORBIS)/.test(head) ? 'audio/webm' : null;
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
  if (textAt(0, 'OggS')) return oggMime(b);
  if (hexAt(0, '1a45dfa3')) return webmMime(b);
  if (textAt(4, 'ftyp')) return ftypMime(b);
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

/** A lone surrogate would make encodeURIComponent throw (a 500 on download). */
function wellFormed(s: string): string {
  return s.replace(
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    '\ufffd',
  );
}

/** The base name the person gave, cleaned, with the extension of the real type. */
export function safeFileName(raw: string | undefined, ext: string): string {
  const base =
    wellFormed(raw ?? '')
      .split(/[\\/]/)
      .pop() ?? '';
  const cleaned = base
    // controls (C0, DEL, C1), line/paragraph separators, bidi marks and overrides
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
      '',
    )
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
export function contentDisposition(rawName: string, download: boolean): string {
  const name = wellFormed(rawName);
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
