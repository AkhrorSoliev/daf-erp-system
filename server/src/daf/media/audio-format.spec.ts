import { istWav } from './audio-format';

// Gemini 3.8 answers with WAV; R2 keys and the players expect mp3.
describe('istWav', () => {
  it('recognises a RIFF/WAVE header', () => {
    const kopf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVEfmt '),
    ]);
    expect(istWav(kopf)).toBe(true);
  });

  it('leaves mp3 alone (ID3 tag or frame sync)', () => {
    expect(
      istWav(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'binary')),
    ).toBe(false);
    expect(
      istWav(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBe(false);
  });

  it('is false for a buffer too short to hold a header', () => {
    expect(istWav(Buffer.from('RIFF'))).toBe(false);
  });
});
