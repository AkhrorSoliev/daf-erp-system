import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import type { WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';
import {
  BELGI_CHEGARASI,
  MissingStimmeArgError,
  gesamtZeichenzahl,
  manifestAktualisieren,
  parseGenAudioArgs,
  pruefeBudget,
  sprechtext,
  zuGenerieren,
  type SprachEintrag,
  type YuklashNatijasi,
} from './daf-gen-audio';

// Bu fayl `daf-gen-audio.ts`ni IMPORT qiladi, lekin uning `main()`i faqat
// `require.main === module`da yuguradi (skriptning o'zidagi izohga
// qarang) — shuning uchun shu import HECH QANDAY tarmoq so'rovi, `fal.ai`
// chaqiruvi yoki R2/baza yozuvi qilmaydi. Quyidagi testlarning HAMMASI
// faqat sof funksiyalarni sinaydi.

describe('pruefeBudget', () => {
  it('400 belgidan oshsa to`xtaydi', () => {
    expect(() => pruefeBudget(401)).toThrow(/400/);
  });

  it('chegara ichida o`tadi', () => {
    expect(() => pruefeBudget(278)).not.toThrow();
  });

  it("chegaraning aynan o'zida o'tadi (qat'iy oshish emas)", () => {
    expect(() => pruefeBudget(BELGI_CHEGARASI)).not.toThrow();
  });
});

describe('sprechtext', () => {
  it('tts bo`lsa o`sha matn yuboriladi, aks holda de', () => {
    // Harf va raqamlar uchun kritik: `Z` ni TTS inglizcha o'qiydi,
    // `Zett` esa nemischa.
    expect(sprechtext({ de: 'Z', tts: 'Zett' })).toBe('Zett');
    expect(sprechtext({ de: 'hallo', tts: null })).toBe('hallo');
  });

  it('tts umuman yo`q bo`lsa ham de qaytadi (undefined)', () => {
    expect(sprechtext({ de: 'danke' })).toBe('danke');
  });
});

describe('gesamtZeichenzahl', () => {
  it('sprechtext bo`yicha belgi yig`indisini hisoblaydi', () => {
    const woerter: SprachEintrag[] = [
      { sourceId: 'a', de: 'hallo', tts: null }, // 5
      { sourceId: 'b', de: 'Z', tts: 'Zett' }, // 4
    ];
    expect(gesamtZeichenzahl(woerter)).toBe(9);
  });

  it('haqiqiy u01/woerter.json chegaradan past qoladi (53 so`z = 278 belgi)', () => {
    // Bu test naqd o'zi himoya: agar kimdir so'z qo'shsa va narx
    // chegaradan oshib ketsa, budjet tekshiruvi HAQIQIY sonlar bilan shu
    // yerda ushlaydi — main() ichida (pullik chaqiruvdan keyin) emas.
    const dataset: WoerterFile = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'content', 'daf', 'a1', 'u01', 'woerter.json'),
        'utf8',
      ),
    );
    expect(dataset.woerter).toHaveLength(53);
    const gesamt = gesamtZeichenzahl(dataset.woerter);
    expect(gesamt).toBe(278);
    expect(() => pruefeBudget(gesamt)).not.toThrow();
  });
});

describe('zuGenerieren', () => {
  it('manifestda kaliti bor so`zni qayta yasamaydi', () => {
    const qoldi = zuGenerieren(
      [
        { sourceId: 'a', de: 'hallo', tts: null },
        { sourceId: 'b', de: 'danke', tts: null },
      ],
      { a: 'daf/audio/x.mp3' },
    );
    expect(qoldi.map((w) => w.sourceId)).toEqual(['b']);
  });

  it('bo`sh manifestda HAMMA so`z qoladi', () => {
    const woerter: SprachEintrag[] = [
      { sourceId: 'a', de: 'hallo', tts: null },
      { sourceId: 'b', de: 'danke', tts: null },
    ];
    expect(zuGenerieren(woerter, {}).map((w) => w.sourceId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('hamma so`zda kalit bo`lsa bo`sh ro`yxat qaytadi (idempotentlik)', () => {
    const woerter: SprachEintrag[] = [
      { sourceId: 'a', de: 'hallo', tts: null },
    ];
    const manifest = { a: 'daf/audio/x.mp3' };
    expect(zuGenerieren(woerter, manifest)).toEqual([]);
  });
});

describe('manifestAktualisieren', () => {
  it('yuklash muvaffaqiyatsiz bo`lsa manifestga yozilmaydi', () => {
    // Aks holda manifest R2 da yo'q faylga ishora qilardi va o'quvchi
    // yangramaydigan tugmani ko'rardi.
    const m = manifestAktualisieren({}, [
      { sourceId: 'a', key: 'daf/audio/x.mp3', ok: true },
      { sourceId: 'b', key: 'daf/audio/y.mp3', ok: false },
    ]);
    expect(m).toEqual({ a: 'daf/audio/x.mp3' });
  });

  it('mavjud manifestni saqlab qoladi, faqat yangilarini qo`shadi', () => {
    const m = manifestAktualisieren({ mavjud: 'daf/audio/eski.mp3' }, [
      { sourceId: 'yangi', key: 'daf/audio/yangi.mp3', ok: true },
    ]);
    expect(m).toEqual({
      mavjud: 'daf/audio/eski.mp3',
      yangi: 'daf/audio/yangi.mp3',
    });
  });

  it('asl manifest obyektini o`zgartirmaydi (immutable)', () => {
    const asl: Record<string, string> = { a: 'daf/audio/x.mp3' };
    manifestAktualisieren(asl, [
      { sourceId: 'b', key: 'daf/audio/y.mp3', ok: true },
    ]);
    expect(asl).toEqual({ a: 'daf/audio/x.mp3' });
  });
});

describe('manifest xavfsizligi — kalit so`zdan CHIQARIB BO`LMAYDI (tripwire)', () => {
  // NEGA SHU YERDA: `neuerAudioSchluessel()`ning o'zi argument olmaydi,
  // shuning uchun uni sinash so'zni HATTO KO'RA OLMAYDI — u yerdagi
  // tripwire strukturaviy jihatdan zaif. Bu skript esa kalit bilan
  // so'zning aynan TO'QNASHGAN joyi: manifest `sourceId → kalit`
  // xaritasi. Shu sababli haqiqiy himoya shu yerda sinaladi — `main()`
  // qiladigani kabi har so'zga TASODIFIY kalit yasaladi va faqat
  // MUVAFFAQIYATLI natija manifestga yoziladi (`manifestAktualisieren`),
  // so'ng manifest qiymatlari so'zning yoki `sourceId`ning o'zidan yoki
  // xeshidan chiqarib bo'lmasligi tasdiqlanadi.
  const woerter: SprachEintrag[] = [
    { sourceId: 'u01-s1-hallo', de: 'hallo', tts: null },
    { sourceId: 'u01-s1-tschuess', de: 'tschüss', tts: null },
    { sourceId: 'u01-s5-z', de: 'Z', tts: 'Zett' },
  ];

  it('manifest qiymati so`zning, sourceId`ning yoki ularning xeshining substringi emas', () => {
    const natijalar: YuklashNatijasi[] = woerter.map((w) => ({
      sourceId: w.sourceId,
      key: neuerAudioSchluessel(),
      ok: true,
    }));
    const manifest = manifestAktualisieren({}, natijalar);

    for (const wort of woerter) {
      const key = manifest[wort.sourceId].toLowerCase();
      const soz = sprechtext(wort);
      const shubhaliQiymatlar = [wort.sourceId, wort.de, soz];

      for (const shubhali of shubhaliQiymatlar) {
        expect(key).not.toContain(shubhali.toLowerCase());

        // Xesh ham himoya bermaydi (`audio-keys.ts` dagi izohga qarang):
        // `AUDIO_WORT`da 4 ta variant ekranda ko'rinadi, shuning uchun
        // ularni xeshlab kalit bilan solishtirish yetarli bo'lardi —
        // agar kalit so'z (yoki sourceId) bilan HISOBLANADIGAN
        // bog'liqlikka ega bo'lsa.
        for (const algo of ['md5', 'sha1', 'sha256'] as const) {
          const hash = createHash(algo).update(shubhali).digest('hex');
          expect(key).not.toContain(hash);
          // Qisqartirilgan xesh ham (masalan URL-xavfsiz kesilgan) —
          // to'liq xeshning boshlanishi kalitda uchramasligi kerak.
          expect(key).not.toContain(hash.slice(0, 16));
        }
      }
    }
  });

  it('bir xil so`zga har chaqiriqda BOSHQA kalit chiqadi (tasodifiylik)', () => {
    const bir = neuerAudioSchluessel();
    const ikki = neuerAudioSchluessel();
    expect(bir).not.toBe(ikki);
  });
});

describe('parseGenAudioArgs', () => {
  it('`--stimme` yo`q bo`lsa yiqiladi', () => {
    expect(() => parseGenAudioArgs([])).toThrow(MissingStimmeArgError);
  });

  it('`--stimme` qiymatsiz bo`lsa ham yiqiladi', () => {
    expect(() => parseGenAudioArgs(['--stimme'])).toThrow(
      MissingStimmeArgError,
    );
  });

  it('`--stimme none` — Chatterbox (stimme null)', () => {
    expect(parseGenAudioArgs(['--stimme', 'none'])).toEqual({
      stimme: null,
    });
  });

  it('`--stimme Rachel` — ElevenLabs ovoz nomi saqlanadi', () => {
    expect(parseGenAudioArgs(['--stimme', 'Rachel'])).toEqual({
      stimme: 'Rachel',
    });
  });
});
