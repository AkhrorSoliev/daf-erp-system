import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';
import {
  BELGI_CHEGARASI,
  InvalidSpeedArgError,
  MissingSpeedArgError,
  MissingStimmeArgError,
  SpeedOutOfRangeArgError,
  UnknownStimmeArgError,
  InvalidUnitArgError,
  MissingUnitArgError,
  gesamtZeichenzahl,
  manifestAktualisieren,
  RUXSAT_ETILGAN_STIMMELAR,
  parseErsetzenArg,
  parseGenAudioArgs,
  sprichMitAblehnungsschutz,
  WORT_ANWEISUNG,
  parseUnitArg,
  woerterPfad,
  pruefeBudget,
  schluesselFuerWort,
  sprechtext,
  zuGenerieren,
  type SprachEintrag,
  type YuklashNatijasi,
} from './daf-gen-audio';
import { FalAblehnungError } from '../src/daf/media/fal-client';

// Bu fayl `daf-gen-audio.ts`ni IMPORT qiladi, lekin uning `main()`i faqat
// `require.main === module`da yuguradi (skriptning o'zidagi izohga
// qarang) — shuning uchun shu import HECH QANDAY tarmoq so'rovi, `fal.ai`
// chaqiruvi yoki R2/baza yozuvi qilmaydi. Quyidagi testlarning HAMMASI
// faqat sof funksiyalarni sinaydi.

describe('pruefeBudget', () => {
  it('chegara qiymati aniq 400 (brifda qat`iy belgilangan)', () => {
    // Ko'rikda topilgan zaiflik: pastdagi "aynan chegarada" testi
    // `BELGI_CHEGARASI`ning O'ZIDAN foydalanardi, shuning uchun chegara
    // qiymati o'zgarib qolsa ham (masalan 400 → 4000) o'sha test hech
    // qachon buni ushlamas edi (o'z-o'ziga qarshi solishtirilgani uchun
    // doim to'g'ri chiqadi). Qiymat shu yerda AYNAN raqam bilan qadaladi.
    expect(BELGI_CHEGARASI).toBe(400);
  });

  it('400 belgidan oshsa to`xtaydi', () => {
    expect(() => pruefeBudget(401)).toThrow(/400/);
  });

  it('chegara ichida o`tadi', () => {
    expect(() => pruefeBudget(278)).not.toThrow();
  });

  it("chegaraning aynan o'zida o'tadi (qat'iy oshish emas)", () => {
    // Literal `400` — `BELGI_CHEGARASI`ga emas, xuddi shu qiymatga
    // tekshiriladi: yuqoridagi test allaqachon konstantani 400ga
    // qadagan, shuning uchun bu yerda simvolga ishonish endi ortiqcha
    // bilvosita bog'liqlik yaratardi.
    expect(() => pruefeBudget(400)).not.toThrow();
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
  // KO'RIKDAN KEYINGI TUZATISH: birinchi versiya bu yerda to'g'ridan-
  // to'g'ri `neuerAudioSchluessel()`ni chaqirardi va natijani
  // `manifestAktualisieren`ga uzatardi — bu ikkita narsani isbotlaydi
  // (generator tasodifiy, merger sourceId qo'shib yubormaydi), lekin
  // kalit bilan so'z HAQIQATDA to'qnashadigan joy — `main()`dagi
  // `schluesselFuerWort(wort)` chaqiruvi — HECH QANDAY testda yo'q edi.
  // Shu sababli `main()`da kalitni so'zning o'zidan (yoki xeshidan)
  // hisoblab chiqaradigan dekoy o'zgarish HAMMA 19 testni yashil
  // qoldirar edi (task-7-report.md'dagi RED/GREEN isboti).
  //
  // Tuzatish: tripwire endi `main()` ishlatadigan AYNAN o'sha funksiyani
  // (`schluesselFuerWort`) chaqiradi, boshqa hech narsani emas — shu
  // bilan test va ishlab chiqarish kodi bitta chaqiruv nuqtasini
  // ulashadi va biri ikkinchisidan uzoqlashib keta olmaydi.
  const woerter: SprachEintrag[] = [
    { sourceId: 'u01-s1-hallo', de: 'hallo', tts: null },
    { sourceId: 'u01-s1-tschuess', de: 'tschüss', tts: null },
    { sourceId: 'u01-s5-z', de: 'Z', tts: 'Zett' },
  ];

  it('manifest qiymati so`zning, sourceId`ning yoki ularning xeshining substringi emas', () => {
    const natijalar: YuklashNatijasi[] = woerter.map((w) => ({
      sourceId: w.sourceId,
      key: schluesselFuerWort(w),
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

  it('`--stimme Erinome --speed 0.85` keeps the voice and the tempo', () => {
    expect(
      parseGenAudioArgs(['--stimme', 'Erinome', '--speed', '0.85']),
    ).toEqual({
      stimme: 'Erinome',
      speed: 0.85,
    });
  });

  // CEO, 2026-09-25: every course word in ONE native-German voice, no mixing.
  // The English-native voices and Chatterbox stay usable for the voice-sample
  // script, but this script refuses them, so no unit can drift back to them.
  it('refuses the voices the CEO ruled out for words (Rachel, Matilda, Chatterbox)', () => {
    for (const eski of ['Rachel', 'Matilda', 'none']) {
      expect(() =>
        parseGenAudioArgs(['--stimme', eski, '--speed', '0.85']),
      ).toThrow(UnknownStimmeArgError);
    }
  });

  it('the only allowed word voice is the one the CEO chose', () => {
    expect(RUXSAT_ETILGAN_STIMMELAR).toEqual(['Erinome']);
  });

  // A default tempo would silently undo the slow speed the CEO chose.
  it('`--speed` yo`q bo`lsa yiqiladi', () => {
    expect(() => parseGenAudioArgs(['--stimme', 'Erinome'])).toThrow(
      MissingSpeedArgError,
    );
  });

  it('`--speed` qiymatsiz bo`lsa ham yiqiladi', () => {
    expect(() => parseGenAudioArgs(['--stimme', 'Erinome', '--speed'])).toThrow(
      MissingSpeedArgError,
    );
  });

  it('`--speed` son bo`lmasa yiqiladi', () => {
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Erinome', '--speed', 'sekin']),
    ).toThrow(InvalidSpeedArgError);
  });

  it('`--speed` 0.7–1.2 oralig`idan tashqari bo`lsa yiqiladi', () => {
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Erinome', '--speed', '0.5']),
    ).toThrow(SpeedOutOfRangeArgError);
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Erinome', '--speed', '1.5']),
    ).toThrow(SpeedOutOfRangeArgError);
  });

  it('`--speed` oralig`ning ikkala chetida ham o`tadi', () => {
    expect(
      parseGenAudioArgs(['--stimme', 'Erinome', '--speed', '0.7']),
    ).toEqual({ stimme: 'Erinome', speed: 0.7 });
    expect(
      parseGenAudioArgs(['--stimme', 'Erinome', '--speed', '1.2']),
    ).toEqual({ stimme: 'Erinome', speed: 1.2 });
  });

  it('noma`lum ovoz nomi (yozuv xatosi) `fal.ai`ga borishdan OLDIN rad etiladi', () => {
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Erinom', '--speed', '0.85']),
    ).toThrow(UnknownStimmeArgError);
    // The message names what was sent and what is allowed.
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Erinom', '--speed', '0.85']),
    ).toThrow(/Erinom.*Erinome/);
  });
});

describe('parseErsetzenArg', () => {
  it('is false without the flag: a rerun never replaces existing audio by accident', () => {
    expect(parseErsetzenArg(['--unit', '3'])).toBe(false);
  });

  it('is true with `--ersetzen`', () => {
    expect(parseErsetzenArg(['--unit', '3', '--ersetzen'])).toBe(true);
  });
});

describe('zuGenerieren with ersetzen', () => {
  it('takes every word, including those that already have audio', () => {
    const woerter: SprachEintrag[] = [
      { sourceId: 'a', de: 'hallo', tts: null },
      { sourceId: 'b', de: 'danke', tts: null },
    ];
    expect(
      zuGenerieren(woerter, { a: 'daf/audio/x.mp3' }, true).map(
        (w) => w.sourceId,
      ),
    ).toEqual(['a', 'b']);
  });
});

describe('manifestAktualisieren with ersetzen', () => {
  // Keeping the old key of a word whose new audio failed would leave that
  // one word in the rejected voice: exactly the mix the CEO ruled out.
  it('drops the old key of a word whose replacement failed', () => {
    const m = manifestAktualisieren(
      {
        a: 'daf/audio/eski-a.mp3',
        b: 'daf/audio/eski-b.mp3',
        c: 'daf/audio/eski-c.mp3',
      },
      [
        { sourceId: 'a', key: 'daf/audio/yangi-a.mp3', ok: true },
        { sourceId: 'b', key: 'daf/audio/yangi-b.mp3', ok: false },
      ],
      true,
    );
    expect(m).toEqual({
      a: 'daf/audio/yangi-a.mp3',
      c: 'daf/audio/eski-c.mp3',
    });
  });

  it('without ersetzen a failed word keeps whatever it had', () => {
    const m = manifestAktualisieren({ b: 'daf/audio/eski-b.mp3' }, [
      { sourceId: 'b', key: 'daf/audio/yangi-b.mp3', ok: false },
    ]);
    expect(m).toEqual({ b: 'daf/audio/eski-b.mp3' });
  });
});

describe('sprichMitAblehnungsschutz', () => {
  function sprecher(antworten: Array<'ablehnen' | 'fehler' | string>) {
    const gesendet: string[] = [];
    const fn = async (text: string, anweisung?: string): Promise<string> => {
      gesendet.push(anweisung ? `${anweisung} | ${text}` : text);
      const a = antworten.shift();
      if (a === 'ablehnen')
        throw new FalAblehnungError('content_policy_violation');
      if (a === 'fehler') throw new Error('fal.ai javob bermadi (500)');
      return a ?? 'https://x/none.mp3';
    };
    return { fn, gesendet };
  }

  it('returns the first answer when nothing is refused', async () => {
    const { fn, gesendet } = sprecher(['https://x/1.mp3']);
    await expect(sprichMitAblehnungsschutz(fn, 'dann')).resolves.toEqual({
      url: 'https://x/1.mp3',
      gesprochen: 'dann',
      mitAnweisung: false,
      versuche: 1,
    });
    expect(gesendet).toEqual(['dann']);
  });

  // "zwischen" was refused once and accepted on the next identical request.
  it('asks again with the same text after a refusal', async () => {
    const { fn, gesendet } = sprecher([
      'ablehnen',
      'ablehnen',
      'https://x/3.mp3',
    ]);
    const r = await sprichMitAblehnungsschutz(fn, 'zwischen');
    expect(r).toEqual({
      url: 'https://x/3.mp3',
      gesprochen: 'zwischen',
      mitAnweisung: false,
      versuche: 3,
    });
    expect(gesendet).toEqual(['zwischen', 'zwischen', 'zwischen']);
  });

  // "dann" was refused three times; a full stop is the smallest change that
  // still makes the audio say only the word.
  it('adds a full stop after three refusals of the bare word', async () => {
    const { fn, gesendet } = sprecher([
      'ablehnen',
      'ablehnen',
      'ablehnen',
      'https://x/4.mp3',
    ]);
    const r = await sprichMitAblehnungsschutz(fn, 'dann');
    expect(r).toEqual({
      url: 'https://x/4.mp3',
      gesprochen: 'dann.',
      mitAnweisung: false,
      versuche: 4,
    });
    expect(gesendet).toEqual(['dann', 'dann', 'dann', 'dann.']);
  });

  // "ich", "Sie", "aus" and five more were refused all five times in the
  // 2026-09-25 run. The model seems not to take one short word as a speech
  // request; an instruction it follows but does not speak settles that.
  it('asks with the unspoken instruction after five refusals', async () => {
    const { fn, gesendet } = sprecher([
      ...Array<string>(5).fill('ablehnen'),
      'https://x/6.mp3',
    ]);
    const r = await sprichMitAblehnungsschutz(fn, 'ich');
    expect(r).toEqual({
      url: 'https://x/6.mp3',
      gesprochen: 'ich',
      mitAnweisung: true,
      versuche: 6,
    });
    expect(gesendet[5]).toBe(`${WORT_ANWEISUNG} | ich`);
  });

  it('gives up with FalAblehnungError after seven refusals', async () => {
    const { fn, gesendet } = sprecher(Array(7).fill('ablehnen'));
    await expect(sprichMitAblehnungsschutz(fn, 'dann')).rejects.toBeInstanceOf(
      FalAblehnungError,
    );
    expect(gesendet).toHaveLength(7);
  });

  it('does not retry any other error', async () => {
    const { fn, gesendet } = sprecher(['fehler', 'https://x/never.mp3']);
    await expect(sprichMitAblehnungsschutz(fn, 'dann')).rejects.toThrow(/500/);
    expect(gesendet).toEqual(['dann']);
  });
});

// The script was written for unit 1 alone, with the word list path fixed
// to u01. Units 2 and 3 need the same voice, so the unit is now a
// required flag, read and validated before anything is sent to fal.ai.
describe('parseUnitArg', () => {
  it('reads `--unit 2` as u02', () => {
    expect(parseUnitArg(['--unit', '2'])).toBe('u02');
  });

  it('reads the flag wherever it stands among the voice flags', () => {
    expect(
      parseUnitArg(['--stimme', 'Rachel', '--speed', '0.85', '--unit', '3']),
    ).toBe('u03');
  });

  it('accepts the last unit of the course map', () => {
    expect(parseUnitArg(['--unit', '12'])).toBe('u12');
  });

  it('refuses a run without `--unit` instead of defaulting to unit 1', () => {
    expect(() =>
      parseUnitArg(['--stimme', 'Rachel', '--speed', '0.85']),
    ).toThrow(MissingUnitArgError);
  });

  it.each(['0', '13', 'x', '1.5', '-1', '02a'])(
    'refuses `--unit %s` (not a unit of the A1 map)',
    (value) => {
      expect(() => parseUnitArg(['--unit', value])).toThrow(
        InvalidUnitArgError,
      );
    },
  );
});

describe('budget for the units that follow unit 1', () => {
  // One run per unit must fit under the 400-character guard, or the
  // script stops before the first paid call. Measured on the written
  // files: u02 = 302, u03 = 281.
  it.each(['u02', 'u03'])('%s words fit one run', (unit) => {
    const dataset: WoerterFile = JSON.parse(
      readFileSync(woerterPfad(unit), 'utf8'),
    );
    expect(dataset.woerter).toHaveLength(50);
    expect(() =>
      pruefeBudget(gesamtZeichenzahl(dataset.woerter)),
    ).not.toThrow();
  });
});

describe('woerterPfad', () => {
  it('points at the chosen unit`s word file', () => {
    expect(woerterPfad('u03')).toBe(
      join(__dirname, '..', 'content', 'daf', 'a1', 'u03', 'woerter.json'),
    );
  });
});
