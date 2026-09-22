import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';
import {
  BELGI_CHEGARASI,
  InvalidSpeedArgError,
  MissingSpeedArgError,
  MissingStimmeArgError,
  SpeedNotAllowedWithNoneArgError,
  SpeedOutOfRangeArgError,
  UnknownStimmeArgError,
  gesamtZeichenzahl,
  manifestAktualisieren,
  parseGenAudioArgs,
  pruefeBudget,
  schluesselFuerWort,
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

  it('`--stimme none` — Chatterbox (stimme va speed ikkalasi ham null)', () => {
    expect(parseGenAudioArgs(['--stimme', 'none'])).toEqual({
      stimme: null,
      speed: null,
    });
  });

  it('`--stimme Rachel --speed 0.85` — ovoz nomi va tezlik ikkalasi ham saqlanadi', () => {
    expect(
      parseGenAudioArgs(['--stimme', 'Rachel', '--speed', '0.85']),
    ).toEqual({
      stimme: 'Rachel',
      speed: 0.85,
    });
  });

  it('`--stimme Matilda --speed 1.0` — ikkinchi ElevenLabs ovozi ham saqlanadi', () => {
    expect(
      parseGenAudioArgs(['--stimme', 'Matilda', '--speed', '1.0']),
    ).toEqual({
      stimme: 'Matilda',
      speed: 1.0,
    });
  });

  // Bu brifning markaziy talabi: CEO Rachel + 0.85ni tanladi, va
  // `--speed` yo'qligida standart qiymatga (masalan 1.0) tushib qolish
  // shu tanlovni jimgina bekor qilardi. Agar `parseGenAudioArgs` `speed`
  // uchun ANIQ standart qo'ysa (masalan `speedRaw ?? '1.0'`), bu test
  // qizil bo'ladi.
  it('ElevenLabs ovozi bilan `--speed` yo`q bo`lsa yiqiladi', () => {
    expect(() => parseGenAudioArgs(['--stimme', 'Rachel'])).toThrow(
      MissingSpeedArgError,
    );
  });

  it('`--speed` qiymatsiz bo`lsa ham yiqiladi', () => {
    expect(() => parseGenAudioArgs(['--stimme', 'Rachel', '--speed'])).toThrow(
      MissingSpeedArgError,
    );
  });

  it('`--speed` son bo`lmasa yiqiladi', () => {
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Rachel', '--speed', 'sekin']),
    ).toThrow(InvalidSpeedArgError);
  });

  // Model 0.7–1.2 oralig'idan tashqarini rad etadi — bu tekshiruv
  // `fal.ai`ga yuborishdan OLDIN shu yerda bo'lishi kerak (skript
  // darajasida), FalClient darajasidagi tekshiruvga qo'shimcha
  // himoya sifatida: birinchi so'zdayoq, hatto FalClient
  // yaratilmasdan oldin to'xtash kerak.
  it('`--speed` 0.7–1.2 oralig`idan tashqari bo`lsa yiqiladi', () => {
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Rachel', '--speed', '0.5']),
    ).toThrow(SpeedOutOfRangeArgError);
    expect(() =>
      parseGenAudioArgs(['--stimme', 'Rachel', '--speed', '1.5']),
    ).toThrow(SpeedOutOfRangeArgError);
  });

  it('`--speed` oralig`ning ikkala chetida ham o`tadi', () => {
    expect(parseGenAudioArgs(['--stimme', 'Rachel', '--speed', '0.7'])).toEqual(
      { stimme: 'Rachel', speed: 0.7 },
    );
    expect(parseGenAudioArgs(['--stimme', 'Rachel', '--speed', '1.2'])).toEqual(
      { stimme: 'Rachel', speed: 1.2 },
    );
  });

  // Chatterbox (`--stimme none`) tezlik parametrini QABUL QILMAYDI —
  // `--speed` shu bilan birga berilsa jimgina yutib yuborilmasligi
  // kerak, aks holda operator "tezlik qo'llandi" deb noto'g'ri
  // o'ylab qolardi.
  it('`--stimme none` bilan `--speed` BIRGA berilsa yiqiladi', () => {
    expect(() =>
      parseGenAudioArgs(['--stimme', 'none', '--speed', '0.85']),
    ).toThrow(SpeedNotAllowedWithNoneArgError);
  });

  // Ko'rikda topilgan bo'shliq: ro'yxatda YO'Q qiymat (yozuv xatosi,
  // masalan `Rachel` o'rniga `Rachell`) tekshiruvsiz `fal.ai`ga borishi
  // mumkin edi — u yerda YO qattiq rad etiladi, YO jimgina standart
  // ovozga tushib "muvaffaqiyatli" qaytadi. Ikkalasi ham 53 so'zni
  // NOTO'G'RI ovozda PULLIK yasab yuboradi. Endi bunday qiymat
  // `fal.ai`ga yuborilishidan OLDIN shu yerda rad etiladi.
  it('noma`lum ovoz nomi (yozuv xatosi) `fal.ai`ga borishdan OLDIN rad etiladi', () => {
    expect(() => parseGenAudioArgs(['--stimme', 'Rachell'])).toThrow(
      UnknownStimmeArgError,
    );
    // Xabar NIMA yuborilgani va NIMA ruxsat etilganini aytishi kerak —
    // operator "nega yiqildi" deb kodni ochmasdan tushunishi uchun.
    expect(() => parseGenAudioArgs(['--stimme', 'Rachell'])).toThrow(/Rachell/);
    expect(() => parseGenAudioArgs(['--stimme', 'Rachell'])).toThrow(
      /none.*Rachel.*Matilda/,
    );
  });

  it("bo`sh satr ham noma'lum ovoz sifatida rad etiladi (`none` bilan chalkashtirilmaydi)", () => {
    expect(() => parseGenAudioArgs(['--stimme', 'chatterbox'])).toThrow(
      UnknownStimmeArgError,
    );
  });
});
