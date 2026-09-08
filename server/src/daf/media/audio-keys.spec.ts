import { createHash } from 'crypto';
import {
  neuerAudioSchluessel,
  audioSchluesselFuer,
  type AudioManifest,
} from './audio-keys';

describe('neuerAudioSchluessel', () => {
  it('R2 manzilida xavfsiz shaklda va .mp3 bilan tugaydi', () => {
    const k = neuerAudioSchluessel();
    expect(k).toMatch(/^daf\/audio\/[a-f0-9]{32}\.mp3$/);
  });

  it('har chaqiruvda BOSHQA kalit qaytaradi', () => {
    const kalitlar = new Set(Array.from({ length: 200 }, neuerAudioSchluessel));
    expect(kalitlar.size).toBe(200);
  });

  /**
   * BU TESTNING BUTUN MAZMUNI — TRIPWIRE.
   *
   * `AUDIO_WORT`da ekranda 4 ta variant turadi va o'quvchi ovozni
   * eshitib birini tanlaydi. Kalit so'zdan HISOBLANSA (to'g'ridan-to'g'ri
   * ham, xesh orqali ham), o'quvchi har variantni o'sha usul bilan
   * hisoblab, audio manzili bilan solishtirib to'g'ri javobni topardi —
   * eshitmasdan.
   *
   * Shuning uchun kalit so'z bilan HECH QANDAY hisoblanadigan
   * bog'liqlikka ega bo'lmasligi kerak. Test buni eng ehtimolli uch
   * ko'rinishda tekshiradi.
   */
  it('kalit so`zdan ham, sourceId dan ham, ularning xeshidan ham hosil qilinmaydi', () => {
    const de = 'hallo';
    const sourceId = 'u01-s1-hallo';
    const k = neuerAudioSchluessel();

    expect(k).not.toContain(de);
    expect(k).not.toContain(sourceId);
    for (const manba of [de, sourceId]) {
      const md5 = createHash('md5').update(manba).digest('hex');
      const sha = createHash('sha256').update(manba).digest('hex');
      expect(k).not.toContain(md5);
      expect(k).not.toContain(sha.slice(0, 32));
    }
  });
});

describe('audioSchluesselFuer', () => {
  const manifest: AudioManifest = { 'u01-s1-hallo': 'daf/audio/abc.mp3' };

  it('manifestdagi kalitni qaytaradi', () => {
    expect(audioSchluesselFuer(manifest, 'u01-s1-hallo')).toBe('daf/audio/abc.mp3');
  });

  it('manifestda yo`q so`zga null qaytaradi', () => {
    // Audio hali yasalmagan so'z — bu XATO EMAS, oddiy holat: audio
    // bosqichma-bosqich yasaladi va audiosi yo'q so'zga audio savol
    // qurilmaydi.
    expect(audioSchluesselFuer(manifest, 'u01-s4-eins')).toBeNull();
  });
});
