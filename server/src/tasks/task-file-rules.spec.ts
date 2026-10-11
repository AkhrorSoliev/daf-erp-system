import { BadRequestException } from '@nestjs/common';
import {
  EMPTY_FILE_MESSAGE,
  FILE_SIZE_MESSAGE,
  FILE_TYPE_MESSAGE,
  MAX_TASK_FILE_BYTES,
  MAX_VOICE_BYTES,
  VOICE_LIMIT_MESSAGE,
  checkTaskFile,
  contentDisposition,
  freshPhotoSince,
  safeFileName,
  sniffMime,
  taskFileKey,
} from './task-file-rules';

const hex = (h: string) => Buffer.from(h, 'hex');
const pad = (b: Buffer, n = 32) => Buffer.concat([b, Buffer.alloc(n)]);
const PNG = pad(hex('89504e470d0a1a0a'));
const JPG = pad(hex('ffd8ffe0'));
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(16),
]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const OGG = Buffer.concat([
  Buffer.from('OggS'),
  Buffer.alloc(24),
  Buffer.from('OpusHead'),
  Buffer.alloc(8),
]);
const WEBM = Buffer.concat([
  hex('1a45dfa3'),
  Buffer.alloc(8),
  Buffer.from('webm'),
  Buffer.alloc(16),
]);
const MKV = Buffer.concat([
  hex('1a45dfa3'),
  Buffer.alloc(8),
  Buffer.from('matroska'),
  Buffer.alloc(16),
]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

/** An ISO-BMFF `ftyp` box: size, "ftyp", major brand, minor version, compatible brands. */
const ftyp = (major: string, compat: string[] = [], sizeOverride?: number) => {
  const body = Buffer.concat([
    Buffer.from('ftyp'),
    Buffer.from(major, 'latin1'),
    Buffer.alloc(4),
    ...compat.map((c) => Buffer.from(c, 'latin1')),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(sizeOverride ?? body.length + 4);
  return Buffer.concat([size, body, Buffer.alloc(16)]);
};
const MP4 = ftyp('isom', ['isom', 'mp42']);

/** A zip made of real local file headers, one per entry name. */
const zip = (...names: string[]) =>
  Buffer.concat(
    names.map((name) => {
      const head = Buffer.alloc(30);
      head.write('PK\x03\x04', 0, 'latin1');
      head.writeUInt16LE(Buffer.byteLength(name), 26);
      return Buffer.concat([head, Buffer.from(name), Buffer.alloc(8)]);
    }),
  );
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = zip('[Content_Types].xml', '_rels/.rels', 'word/document.xml');
const XLSX = zip('[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml');

describe('sniffMime', () => {
  it.each([
    [PNG, 'image/png'],
    [JPG, 'image/jpeg'],
    [WEBP, 'image/webp'],
    [PDF, 'application/pdf'],
    [OGG, 'audio/ogg'],
    [WEBM, 'audio/webm'],
    [MP4, 'video/mp4'],
    [DOCX, DOCX_MIME],
    [XLSX, XLSX_MIME],
  ])('reads the type from the bytes (%#)', (buf, mime) => {
    expect(sniffMime(buf)).toBe(mime);
  });
  it('knows nothing else: html, a non-webm matroska, an empty buffer', () => {
    for (const b of [HTML, MKV, Buffer.alloc(0)]) {
      expect(sniffMime(b)).toBeNull();
    }
  });

  describe('ftyp brands', () => {
    it.each(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1'])(
      'accepts the video major brand %s',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBe('video/mp4');
      },
    );
    it.each(['M4V ', 'mmp4', 'dash', 'qt  '])(
      'accepts the video major brand "%s"',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBe('video/mp4');
      },
    );
    it.each(['heic', 'heix', 'mif1', 'msf1', 'avif', 'avis', 'M4A '])(
      'refuses the photo/audio major brand "%s"',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBeNull();
        expect(sniffMime(ftyp(brand, ['isom', 'mp42']))).toBeNull();
      },
    );
    it('takes an unknown major brand from a compatible video brand', () => {
      expect(sniffMime(ftyp('XXXX', ['XXXX', 'mp42']))).toBe('video/mp4');
    });
    it('refuses an unknown major brand with no video brand at all', () => {
      expect(sniffMime(ftyp('XXXX'))).toBeNull();
      expect(sniffMime(ftyp('XXXX', ['YYYY', 'ZZZZ']))).toBeNull();
    });
    it('refuses when a photo/audio brand is compatible too', () => {
      expect(sniffMime(ftyp('XXXX', ['mp41', 'heic']))).toBeNull();
      expect(sniffMime(ftyp('XXXX', ['mp41', 'avif']))).toBeNull();
      expect(sniffMime(ftyp('XXXX', ['M4A ', 'mp42']))).toBeNull();
    });
    it('reads compatible brands only inside the box size', () => {
      // 16-byte box: size, ftyp, major, minor. The "mp42" after it is not part of it.
      expect(sniffMime(ftyp('XXXX', ['mp42'], 16))).toBeNull();
      // A box size larger than the buffer is read up to the buffer's end.
      expect(sniffMime(ftyp('XXXX', ['mp42'], 4096))).toBe('video/mp4');
    });
    it('refuses a truncated box', () => {
      expect(
        sniffMime(Buffer.concat([hex('00000014'), Buffer.from('ftyp')])),
      ).toBeNull();
    });
  });

  describe('zip containers', () => {
    it('refuses any zip that is not a docx or xlsx', () => {
      expect(sniffMime(zip('notes.txt'))).toBeNull();
      expect(sniffMime(zip('a.txt', 'b.txt'))).toBeNull();
      expect(sniffMime(zip('[Content_Types].xml'))).toBeNull();
      expect(
        sniffMime(zip('[Content_Types].xml', 'ppt/presentation.xml')),
      ).toBeNull();
      expect(sniffMime(zip('word/document.xml'))).toBeNull();
      expect(sniffMime(zip('xl/workbook.xml'))).toBeNull();
    });
    it('refuses a bare zip header that only mentions the names in its data', () => {
      const lie = Buffer.concat([
        hex('504b0304'),
        Buffer.alloc(26),
        Buffer.from('[Content_Types].xml word/document.xml xl/workbook.xml'),
      ]);
      expect(sniffMime(lie)).toBeNull();
    });
    it('refuses a header whose name runs past the buffer', () => {
      const head = Buffer.alloc(30);
      head.write('PK\x03\x04', 0, 'latin1');
      head.writeUInt16LE(500, 26);
      expect(sniffMime(Buffer.concat([head, Buffer.from('word/')]))).toBeNull();
    });
  });
});

describe('checkTaskFile', () => {
  it('gives the type, extension and kind', () => {
    expect(checkTaskFile({ buffer: PNG })).toEqual({
      mime: 'image/png',
      ext: '.png',
      kind: 'IMAGE',
    });
    expect(checkTaskFile({ buffer: OGG, durationSec: 42 })).toEqual({
      mime: 'audio/ogg',
      ext: '.ogg',
      kind: 'VOICE',
    });
    expect(checkTaskFile({ buffer: WEBM })).toEqual({
      mime: 'audio/webm',
      ext: '.webm',
      kind: 'VOICE',
    });
    expect(checkTaskFile({ buffer: MP4 })).toMatchObject({
      ext: '.mp4',
      kind: 'DOCUMENT',
    });
    expect(checkTaskFile({ buffer: XLSX })).toMatchObject({
      ext: '.xlsx',
      kind: 'DOCUMENT',
    });
    expect(checkTaskFile({ buffer: DOCX })).toMatchObject({
      ext: '.docx',
      kind: 'DOCUMENT',
    });
  });
  const refused = (
    input: { buffer: Buffer; durationSec?: number },
    message: string,
  ) => {
    expect(() => checkTaskFile(input)).toThrow(BadRequestException);
    expect(() => checkTaskFile(input)).toThrow(message);
  };
  it('refuses an unknown type, an empty file, an oversized one', () => {
    refused({ buffer: HTML }, FILE_TYPE_MESSAGE);
    refused({ buffer: Buffer.alloc(0) }, EMPTY_FILE_MESSAGE);
    refused(
      { buffer: Buffer.concat([PNG, Buffer.alloc(MAX_TASK_FILE_BYTES)]) },
      FILE_SIZE_MESSAGE,
    );
  });
  it('refuses HEIC, AVIF and M4A with the type message', () => {
    refused({ buffer: ftyp('heic', ['mif1', 'heic']) }, FILE_TYPE_MESSAGE);
    refused({ buffer: ftyp('avif', ['mif1']) }, FILE_TYPE_MESSAGE);
    refused({ buffer: ftyp('M4A ', ['isom']) }, FILE_TYPE_MESSAGE);
    refused({ buffer: zip('notes.txt') }, FILE_TYPE_MESSAGE);
  });
  it('refuses audio over 3 minutes or over 2 MB', () => {
    refused({ buffer: OGG, durationSec: 181 }, VOICE_LIMIT_MESSAGE);
    refused(
      { buffer: Buffer.concat([OGG, Buffer.alloc(MAX_VOICE_BYTES)]) },
      VOICE_LIMIT_MESSAGE,
    );
    expect(checkTaskFile({ buffer: OGG, durationSec: 180 }).kind).toBe('VOICE');
  });
});

describe('safeFileName', () => {
  it.each([
    ['Hisobot.PDF', '.pdf', 'Hisobot.pdf'],
    ['C:\\fakepath\\rasm.png', '.png', 'rasm.png'],
    ['../../etc/passwd', '.pdf', 'passwd.pdf'],
    ['photo.html', '.png', 'photo.png'],
    ['a\u0000b.txt.exe', '.pdf', 'ab.txt.pdf'],
    ['Ўқув режаси.docx', '.docx', 'Ўқув режаси.docx'],
    [undefined, '.jpg', 'fayl.jpg'],
    ['   ', '.jpg', 'fayl.jpg'],
    ['.png', '.png', 'fayl.png'],
  ])('%p → %p', (raw, ext, out) => {
    expect(safeFileName(raw, ext)).toBe(out);
  });
  it('clips a long name to 120 characters before the extension', () => {
    expect(safeFileName('x'.repeat(300) + '.pdf', '.pdf')).toBe(
      'x'.repeat(120) + '.pdf',
    );
  });
});

it('taskFileKey: company, task, a fresh uuid and the extension', () => {
  const key = taskFileKey(3, 'T1', '.png');
  expect(key).toMatch(/^tasks\/3\/T1\/[0-9a-f-]{36}\.png$/);
  expect(taskFileKey(3, 'T1', '.png')).not.toBe(key);
});

it('contentDisposition: an ASCII fallback and the UTF-8 name', () => {
  expect(contentDisposition('Hisobot oktabr.pdf', true)).toBe(
    `attachment; filename="Hisobot oktabr.pdf"; filename*=UTF-8''Hisobot%20oktabr.pdf`,
  );
  expect(contentDisposition(`Ўқув "1".pdf`, false)).toBe(
    `inline; filename="____ _1_.pdf"; filename*=UTF-8''${encodeURIComponent('Ўқув "1".pdf')}`,
  );
  expect(contentDisposition("o'quv.pdf", true)).toContain(
    `filename*=UTF-8''o%27quv.pdf`,
  );
});

it('freshPhotoSince: the last return, else the creation', () => {
  const createdAt = new Date('2026-10-11T05:00:00Z');
  const lastReturnedAt = new Date('2026-10-12T05:00:00Z');
  expect(freshPhotoSince({ createdAt, lastReturnedAt: null })).toBe(createdAt);
  expect(freshPhotoSince({ createdAt, lastReturnedAt })).toBe(lastReturnedAt);
});
