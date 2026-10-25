import { BadRequestException } from '@nestjs/common';
import { checkChatFile, chatFileKey } from './chat-file-rules';

const png = (extra = 0) =>
  Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(32 + extra),
  ]);
// an Opus-in-Ogg header, as the sniffer needs (a bare 'OggS' is not audio)
const ogg = () =>
  Buffer.concat([
    Buffer.from('OggS'),
    Buffer.alloc(24),
    Buffer.from('OpusHead'),
    Buffer.alloc(8),
  ]);

describe('checkChatFile', () => {
  it('takes a png as an image', () => {
    expect(checkChatFile({ buffer: png() })).toEqual({
      mime: 'image/png',
      ext: '.png',
      kind: 'IMAGE',
    });
  });

  it('takes an ogg as voice up to 120 seconds', () => {
    expect(checkChatFile({ buffer: ogg(), durationSec: 120 }).kind).toBe(
      'VOICE',
    );
    expect(() => checkChatFile({ buffer: ogg(), durationSec: 121 })).toThrow(
      'Ovozli xabar 2 daqiqadan oshmasligi kerak',
    );
  });

  it('refuses an image over 5 MB', () => {
    expect(() => checkChatFile({ buffer: png(5 * 1024 * 1024) })).toThrow(
      'Rasm hajmi 5 MB dan oshmasligi kerak',
    );
  });

  it('refuses a voice file over 2 MB', () => {
    const big = Buffer.concat([ogg(), Buffer.alloc(2 * 1024 * 1024)]);
    expect(() => checkChatFile({ buffer: big, durationSec: 30 })).toThrow(
      'Ovozli xabar 2 daqiqadan oshmasligi kerak',
    );
  });

  it.each([
    ['text', Buffer.from('salom dunyo')],
    ['pdf', Buffer.from('%PDF-1.4 ....')],
  ])('refuses %s with the chat wording', (_n, buffer) => {
    expect(() => checkChatFile({ buffer })).toThrow(BadRequestException);
    expect(() => checkChatFile({ buffer })).toThrow(
      'Faqat rasm (JPG, PNG, WebP) va ovozli xabar yuborish mumkin',
    );
  });

  it('keeps the uuid-based key under the conversation', () => {
    const key = chatFileKey(1, 'c1', '.png');
    expect(key).toMatch(/^chat\/1\/c1\/[0-9a-f-]{36}\.png$/);
  });
});
