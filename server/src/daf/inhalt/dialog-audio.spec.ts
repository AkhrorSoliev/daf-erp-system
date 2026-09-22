import { dialogTextHash, validateDialogAudio } from './dialog-audio';
import type { Dialog } from './unit-inhalt.types';

const dialog = (): Dialog => ({
  id: 'u02-d2',
  section: 'u02-s1',
  titelDe: 'x',
  titelUz: 'x',
  zeilen: [
    { sprecher: 'Anna', de: 'Ist das deine Schwester?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Nein.', uz: 'x', tts: 'Nain.' },
  ],
});

describe('dialogTextHash', () => {
  it('bir xil matn — bir xil xesh, 16 belgi', () => {
    const a = dialogTextHash(dialog().zeilen);
    expect(a).toBe(dialogTextHash(dialog().zeilen));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('tts o`zgarsa xesh o`zgaradi — ovoz aynan tts ni aytadi', () => {
    const z = dialog().zeilen;
    z[1] = { ...z[1], tts: 'Nein.' };
    expect(dialogTextHash(z)).not.toBe(dialogTextHash(dialog().zeilen));
  });

  it('gapiruvchi o`zgarsa xesh o`zgaradi — ovoz obrazga bog`liq', () => {
    const z = dialog().zeilen;
    z[0] = { ...z[0], sprecher: 'Mia' };
    expect(dialogTextHash(z)).not.toBe(dialogTextHash(dialog().zeilen));
  });

  it('uz o`zgarsa xesh o`zgarmaydi — tarjima aytilmaydi', () => {
    const z = dialog().zeilen;
    z[0] = { ...z[0], uz: 'boshqa' };
    expect(dialogTextHash(z)).toBe(dialogTextHash(dialog().zeilen));
  });
});

describe('validateDialogAudio', () => {
  it('manifestda yozuv yo`q — muammo emas (ovoz hali yasalmagan)', () => {
    expect(validateDialogAudio([dialog()], {})).toEqual([]);
  });

  it('xesh mos — toza', () => {
    const d = dialog();
    const manifest = {
      'u02-d2': {
        key: 'daf/audio/abc.mp3',
        textHash: dialogTextHash(d.zeilen),
      },
    };
    expect(validateDialogAudio([d], manifest)).toEqual([]);
  });

  it('matn o`zgargan — audio eski matnni aytyapti', () => {
    const d = dialog();
    const manifest = {
      'u02-d2': { key: 'daf/audio/abc.mp3', textHash: '0000000000000000' },
    };
    expect(validateDialogAudio([d], manifest)).toEqual([
      'u02-d2: dialog matni o`zgargan, audio eski matnni aytyapti — qayta yasang yoki manifestdan o`chiring',
    ]);
  });
});
