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
const OGV = Buffer.concat([
  Buffer.from('OggS'),
  Buffer.alloc(24),
  Buffer.from('\x80theora'),
  Buffer.alloc(8),
]);
/** An EBML header with a doctype and, further on, a codec id of the first track. */
const ebml = (doctype: string, codec: string) =>
  Buffer.concat([
    hex('1a45dfa3'),
    Buffer.alloc(8),
    Buffer.from(doctype),
    Buffer.alloc(40),
    Buffer.from(codec),
    Buffer.alloc(16),
  ]);
const WEBM = ebml('webm', 'A_OPUS');
const WEBM_VIDEO = ebml('webm', 'V_VP9');
const WEBM_NO_CODEC = ebml('webm', '');
const MKV = ebml('matroska', 'A_OPUS');
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
const M4A = ftyp('M4A ', ['isom']);

/** A zip with local headers, a central directory and an end record. */
const zip = (...entries: Array<string | { name: string; data: Buffer }>) => {
  const parts = entries.map((e) =>
    typeof e === 'string' ? { name: e, data: Buffer.alloc(8) } : e,
  );
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of parts) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.write('PK\x03\x04', 0, 'latin1');
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.write('PK\x01\x02', 0, 'latin1');
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    const record = Buffer.concat([local, nameBytes, data]);
    locals.push(record);
    centrals.push(Buffer.concat([central, nameBytes]));
    offset += record.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.write('PK\x05\x06', 0, 'latin1');
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};
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
    [M4A, 'audio/mp4'],
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
  it('tells audio from video in ogg and webm by the codec', () => {
    expect(sniffMime(OGV)).toBeNull();
    expect(sniffMime(WEBM_VIDEO)).toBeNull();
    expect(sniffMime(WEBM_NO_CODEC)).toBeNull();
  });
  it('survives short buffers of every signature', () => {
    const sigs = ['ffd8ff', '89504e47', '25504446', '4f676753', '1a45dfa3'];
    for (const sig of [...sigs, '504b0304', '52494646', '00000014']) {
      for (let n = 0; n <= 4; n++) {
        expect(() => sniffMime(hex(sig).subarray(0, n))).not.toThrow();
      }
    }
  });

  describe('ftyp brands', () => {
    it.each(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1'])(
      'accepts the video major brand %s',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBe('video/mp4');
      },
    );
    it.each(['M4V ', 'mmp4', 'dash'])(
      'accepts the video major brand "%s"',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBe('video/mp4');
      },
    );
    it('types a QuickTime movie as video/quicktime', () => {
      expect(sniffMime(ftyp('qt  '))).toBe('video/quicktime');
      expect(sniffMime(ftyp('qt  ', ['qt  ']))).toBe('video/quicktime');
    });
    it.each(['M4A ', 'M4B '])(
      'takes the audio brand "%s" for a voice note',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBe('audio/mp4');
        expect(sniffMime(ftyp(brand, ['isom', 'mp42']))).toBe('audio/mp4');
        expect(sniffMime(ftyp('isom', ['isom', brand]))).toBe('audio/mp4');
      },
    );
    it.each(['heic', 'heix', 'mif1', 'msf1', 'avif', 'avis'])(
      'refuses the photo major brand "%s"',
      (brand) => {
        expect(sniffMime(ftyp(brand))).toBeNull();
        expect(sniffMime(ftyp(brand, ['isom', 'mp42']))).toBeNull();
        expect(sniffMime(ftyp(brand, ['M4A ']))).toBeNull();
      },
    );
    it('takes an unknown major brand from a compatible video brand', () => {
      expect(sniffMime(ftyp('XXXX', ['XXXX', 'mp42']))).toBe('video/mp4');
    });
    it('refuses an unknown major brand with no video brand at all', () => {
      expect(sniffMime(ftyp('XXXX'))).toBeNull();
      expect(sniffMime(ftyp('XXXX', ['YYYY', 'ZZZZ']))).toBeNull();
    });
    it('refuses when a photo brand is compatible too', () => {
      expect(sniffMime(ftyp('XXXX', ['mp41', 'heic']))).toBeNull();
      expect(sniffMime(ftyp('XXXX', ['mp41', 'avif']))).toBeNull();
    });
    it('reads compatible brands only inside the box size', () => {
      // 16-byte box: size, ftyp, major, minor. The "mp42" after it is not part of it.
      expect(sniffMime(ftyp('XXXX', ['mp42'], 16))).toBeNull();
      // A box size larger than the buffer is read up to the buffer's end.
      expect(sniffMime(ftyp('XXXX', ['mp42'], 4096))).toBe('video/mp4');
    });
    it('reads at most 64 compatible brands', () => {
      const filler = Array<string>(64).fill('XXXX');
      expect(sniffMime(ftyp('XXXX', [...filler, 'mp42'], 4096))).toBeNull();
      expect(sniffMime(ftyp('XXXX', [...filler.slice(1), 'mp42'], 4096))).toBe(
        'video/mp4',
      );
    });
    it('refuses a truncated box', () => {
      expect(
        sniffMime(Buffer.concat([hex('00000014'), Buffer.from('ftyp')])),
      ).toBeNull();
    });
    it('reads a bounded region of a 20 MB box that claims 4 GB', () => {
      const big = Buffer.alloc(MAX_TASK_FILE_BYTES, 'X');
      big.writeUInt32BE(0xffffffff, 0);
      big.write('ftyp', 4, 'latin1');
      expect(sniffMime(big)).toBeNull();
      big.write('mp42', 16 + 64 * 4 + 8, 'latin1'); // past the 64-brand cap
      expect(sniffMime(big)).toBeNull();
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
    it('refuses a part list that is both a docx and an xlsx', () => {
      expect(
        sniffMime(
          zip('[Content_Types].xml', 'word/document.xml', 'xl/workbook.xml'),
        ),
      ).toBeNull();
    });
    it('keeps a docx a docx when it stores an xlsx inside', () => {
      const inner = zip('[Content_Types].xml', 'xl/workbook.xml');
      const docx = zip('[Content_Types].xml', 'word/document.xml', {
        name: 'word/embeddings/Microsoft_Excel_Sheet1.xlsx',
        data: inner,
      });
      expect(sniffMime(docx)).toBe(DOCX_MIME);
      const outer = zip('[Content_Types].xml', 'xl/workbook.xml', {
        name: 'xl/embeddings/Document1.docx',
        data: zip('[Content_Types].xml', 'word/document.xml'),
      });
      expect(sniffMime(outer)).toBe(XLSX_MIME);
    });
    it('reads the end record before a trailing comment', () => {
      const z = zip('[Content_Types].xml', 'word/document.xml');
      z.writeUInt16LE(5, z.length - 2);
      expect(sniffMime(Buffer.concat([z, Buffer.from('hello')]))).toBe(
        DOCX_MIME,
      );
    });
    it('refuses a bare zip header that only mentions the names in its data', () => {
      const lie = Buffer.concat([
        hex('504b0304'),
        Buffer.alloc(26),
        Buffer.from('[Content_Types].xml word/document.xml xl/workbook.xml'),
      ]);
      expect(sniffMime(lie)).toBeNull();
    });
    it('refuses a directory entry whose name runs past the buffer', () => {
      const z = zip('[Content_Types].xml', 'word/document.xml');
      const dir = z.indexOf(hex('504b0102'));
      z.writeUInt16LE(60000, dir + 28);
      expect(sniffMime(z)).toBeNull();
    });
    it('refuses a directory that points outside the buffer', () => {
      const z = zip('[Content_Types].xml', 'word/document.xml');
      z.writeUInt32LE(0xfffffff0, z.length - 6);
      expect(sniffMime(z)).toBeNull();
    });
    it('reads a bounded region of a 20 MB file with huge sizes', () => {
      // 65535 claimed entries with 64 KB names, back to back: at most 5000 are walked.
      const big = Buffer.alloc(MAX_TASK_FILE_BYTES);
      const entry = Buffer.alloc(46);
      entry.write('PK\x01\x02', 0, 'latin1');
      entry.writeUInt16LE(0xffff, 28);
      for (let off = 0; off + 46 <= big.length - 22; off += 46) {
        entry.copy(big, off);
      }
      big.write('PK\x03\x04', 0, 'latin1');
      const end = big.length - 22;
      big.write('PK\x05\x06', end, 'latin1');
      big.writeUInt16LE(0xffff, end + 10);
      expect(sniffMime(big)).toBeNull();
      // no end record at all, only local headers every 4 bytes
      const noEnd = Buffer.alloc(MAX_TASK_FILE_BYTES);
      for (let off = 0; off + 4 <= noEnd.length; off += 4) {
        noEnd.write('PK\x03\x04', off, 'latin1');
      }
      expect(sniffMime(noEnd)).toBeNull();
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
    expect(checkTaskFile({ buffer: M4A })).toEqual({
      mime: 'audio/mp4',
      ext: '.m4a',
      kind: 'VOICE',
    });
    expect(checkTaskFile({ buffer: MP4 })).toMatchObject({
      mime: 'video/mp4',
      ext: '.mp4',
      kind: 'DOCUMENT',
    });
    expect(checkTaskFile({ buffer: ftyp('qt  ') })).toEqual({
      mime: 'video/quicktime',
      ext: '.mov',
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
  it('refuses HEIC, AVIF, a plain zip and a video webm/ogg with the type message', () => {
    refused({ buffer: ftyp('heic', ['mif1', 'heic']) }, FILE_TYPE_MESSAGE);
    refused({ buffer: ftyp('avif', ['mif1']) }, FILE_TYPE_MESSAGE);
    refused({ buffer: zip('notes.txt') }, FILE_TYPE_MESSAGE);
    refused({ buffer: WEBM_VIDEO }, FILE_TYPE_MESSAGE);
    refused({ buffer: OGV }, FILE_TYPE_MESSAGE);
  });
  it('a video webm over 2 MB gets the size or type message, never the voice one', () => {
    const big = Buffer.concat([WEBM_VIDEO, Buffer.alloc(MAX_VOICE_BYTES)]);
    refused({ buffer: big }, FILE_TYPE_MESSAGE);
    refused(
      { buffer: Buffer.concat([big, Buffer.alloc(MAX_TASK_FILE_BYTES)]) },
      FILE_SIZE_MESSAGE,
    );
  });
  it('applies the voice limits to an audio mp4 too, not to a video', () => {
    refused({ buffer: M4A, durationSec: 181 }, VOICE_LIMIT_MESSAGE);
    refused(
      { buffer: Buffer.concat([M4A, Buffer.alloc(MAX_VOICE_BYTES)]) },
      VOICE_LIMIT_MESSAGE,
    );
    const bigVideo = Buffer.concat([MP4, Buffer.alloc(MAX_VOICE_BYTES)]);
    expect(checkTaskFile({ buffer: bigVideo }).kind).toBe('DOCUMENT');
  });
  it('refuses audio over 3 minutes or over 2 MB', () => {
    refused({ buffer: OGG, durationSec: 181 }, VOICE_LIMIT_MESSAGE);
    refused(
      { buffer: Buffer.concat([OGG, Buffer.alloc(MAX_VOICE_BYTES)]) },
      VOICE_LIMIT_MESSAGE,
    );
    expect(checkTaskFile({ buffer: OGG, durationSec: 180 }).kind).toBe('VOICE');
  });
  it('accepts exactly 20 MB and exactly 2 MB of voice', () => {
    const exact20 = Buffer.concat([
      PNG,
      Buffer.alloc(MAX_TASK_FILE_BYTES - PNG.length),
    ]);
    expect(checkTaskFile({ buffer: exact20 }).kind).toBe('IMAGE');
    const exact2 = Buffer.concat([
      OGG,
      Buffer.alloc(MAX_VOICE_BYTES - OGG.length),
    ]);
    expect(checkTaskFile({ buffer: exact2 }).kind).toBe('VOICE');
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
    ['inv\u202Efdp.exe', '.pdf', 'invfdp.pdf'],
    ['a\u2066b\u2069c\u200Ed\u0085e\u2028f.txt', '.pdf', 'abcdef.pdf'],
  ])('%p → %p', (raw, ext, out) => {
    expect(safeFileName(raw, ext)).toBe(out);
  });
  it('clips a long name to 120 characters before the extension', () => {
    expect(safeFileName('x'.repeat(300) + '.pdf', '.pdf')).toBe(
      'x'.repeat(120) + '.pdf',
    );
  });
  it('replaces a lone surrogate so the download header never throws', () => {
    const name = safeFileName('a\ud800b\udc00c.pdf', '.pdf');
    expect(name).toBe('a\ufffdb\ufffdc.pdf');
    expect(() => contentDisposition(name, true)).not.toThrow();
    expect(() => contentDisposition('a\ud800b', true)).not.toThrow();
  });
  it('keeps a character outside the BMP whole', () => {
    expect(safeFileName('hisobot \u{1F4C4}.pdf', '.pdf')).toBe(
      'hisobot \u{1F4C4}.pdf',
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
