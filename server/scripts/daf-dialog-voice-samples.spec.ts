import {
  ayolGapiruvchilarniTop,
  stimmenOverrideBilan,
  tekshirGapiruvchilarDialogda,
  parseVariantFilter,
  pruefeBudget,
  sammleDialogNamunalari,
  VARIANTEN,
  BELGI_CHEGARASI,
  ESKI_AYOL_STIMME,
  type DialogClient,
} from './daf-dialog-voice-samples';
import type { Dialog } from '../src/daf/inhalt/unit-inhalt.types';
import type { Stimmen } from './daf-gen-dialog-audio';

// Bu fayl `daf-dialog-voice-samples.ts`ni IMPORT qiladi, lekin `main()`
// faqat `require.main === module`da yuguradi (skriptning o'zidagi
// izohga qarang) — shuning uchun shu import HECH QANDAY tarmoq so'rovi
// yoki pullik chaqiruv qilmaydi. Quyidagi testlar faqat sof
// funksiyalarni va soxta (fake) klientni sinaydi.

const stimmen: Stimmen = { Anna: 'Aria', Jonas: 'Liam' };

// Haqiqiy `u02-d2` — task-11c brifida ko'rsatilgan "Sie heißt Lena."
// qatori bilan (nemischa ism, ataylab).
const u02d2: Dialog = {
  id: 'u02-d2',
  section: 'u02-s1',
  titelDe: 'Meine Schwester',
  titelUz: 'Mening opam',
  zeilen: [
    { sprecher: 'Anna', de: 'Ist das deine Schwester?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Nein, das ist meine Tochter.', uz: 'x' },
    { sprecher: 'Anna', de: 'Wie heißt sie?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Sie heißt Lena.', uz: 'x' },
    { sprecher: 'Anna', de: 'Und deine Eltern? Wo wohnen sie?', uz: 'x' },
    { sprecher: 'Jonas', de: 'Meine Eltern wohnen in Deutschland.', uz: 'x' },
  ],
};

describe('ESKI_AYOL_STIMME', () => {
  it('birinchi namunada ishlatilgan, rad etilgan ayol ovozi — "Aria"', () => {
    expect(ESKI_AYOL_STIMME).toBe('Aria');
  });
});

describe('VARIANTEN', () => {
  it('uchta ayol-ovoz nomzodi — brifda aniq belgilangan', () => {
    // Faqat `id`larni emas, to'liq obyektlarni tekshiradi — `stimme`
    // qiymati ElevenLabs'ga YUBORILADIGAN aynan shu narsa, uni
    // boshqa nomga (masalan yozuv xatosi bilan) almashtirib qo'yish
    // bu test bilan darhol ushlanadi.
    expect(VARIANTEN).toEqual([
      { id: 'sarah', label: 'ElevenLabs — Sarah', stimme: 'Sarah' },
      { id: 'matilda', label: 'ElevenLabs — Matilda', stimme: 'Matilda' },
      { id: 'laura', label: 'ElevenLabs — Laura', stimme: 'Laura' },
    ]);
  });
});

describe('ayolGapiruvchilarniTop', () => {
  it('hozirgi ovozi "Aria" bo`lgan gapiruvchini ISM emas OVOZ bo`yicha topadi', () => {
    expect(ayolGapiruvchilarniTop(u02d2, stimmen)).toEqual(['Anna']);
  });

  it('Liam ovozidagi Jonasni qaytarmaydi', () => {
    expect(ayolGapiruvchilarniTop(u02d2, stimmen)).not.toContain('Jonas');
  });

  it('dublikatsiz — Anna dialogda 3 marta gapirsa ham bitta marta qaytadi', () => {
    expect(ayolGapiruvchilarniTop(u02d2, stimmen)).toHaveLength(1);
  });

  it('hech kim "Aria" ovozida bo`lmasa — bo`sh ro`yxat (taxmin qilib topmaydi)', () => {
    expect(
      ayolGapiruvchilarniTop(u02d2, { Anna: 'Matilda', Jonas: 'Liam' }),
    ).toEqual([]);
  });
});

describe('stimmenOverrideBilan', () => {
  it('faqat ko`rsatilgan gapiruvchini yangi ovozga o`zgartiradi', () => {
    expect(stimmenOverrideBilan(stimmen, ['Anna'], 'Sarah')).toEqual({
      Anna: 'Sarah',
      Jonas: 'Liam',
    });
  });

  it('asl obyektni MUTATSIYA qilmaydi', () => {
    const asl = { ...stimmen };
    stimmenOverrideBilan(stimmen, ['Anna'], 'Sarah');
    expect(stimmen).toEqual(asl);
  });

  it('bo`sh ro`yxat bilan hech narsa o`zgarmaydi', () => {
    expect(stimmenOverrideBilan(stimmen, [], 'Sarah')).toEqual(stimmen);
  });
});

describe('tekshirGapiruvchilarDialogda', () => {
  it('dialogdagi haqiqiy gapiruvchi bilan xato tashlamaydi', () => {
    expect(() =>
      tekshirGapiruvchilarDialogda(['Anna'], ['Anna', 'Jonas']),
    ).not.toThrow();
  });

  it('`--stimme-override` yozuv xatosini (dialogda yo`q ism) ushlaydi', () => {
    // Bu qo'riqchi bo'lmasa, "Ana" (yozuv xatosi) `stimmenOverrideBilan`ga
    // jimgina qo'shilib, haqiqiy gapiruvchi (Anna) ESKI ovozda qolib
    // ketardi — hech qanday xato ko'rinmasdan.
    expect(() =>
      tekshirGapiruvchilarDialogda(['Ana'], ['Anna', 'Jonas']),
    ).toThrow(/"Ana".*yo'q/);
  });
});

describe('parseVariantFilter', () => {
  it('bayroqsiz — HAMMA variant (standart to`liq oqim)', () => {
    expect(parseVariantFilter([])).toEqual(VARIANTEN);
  });

  it('`--variant <id>` bilan bitta variantga toraytiradi (qayta urinish uchun)', () => {
    expect(parseVariantFilter(['--variant', 'laura'])).toEqual([
      VARIANTEN.find((v) => v.id === 'laura'),
    ]);
  });

  it('noma`lum ID — xato (yozuv xatosini yutib yubormaydi)', () => {
    expect(() => parseVariantFilter(['--variant', 'rachel'])).toThrow(
      /rachel/,
    );
  });
});

describe('pruefeBudget', () => {
  it('chegaradan oshsa chaqiruvdan OLDIN to`xtaydi', () => {
    expect(() => pruefeBudget(BELGI_CHEGARASI + 1)).toThrow(/TO'XTATILDI/);
  });

  it('chegaraning aynan o`zida o`tadi (qat`iy oshish emas)', () => {
    expect(() => pruefeBudget(BELGI_CHEGARASI)).not.toThrow();
  });

  it('haqiqiy u02-d2 (148 belgi) x 3 variant chegaradan past qoladi', () => {
    const haqiqiyJami =
      u02d2.zeilen.reduce((sum, z) => sum + (z.tts ?? z.de).length, 0) *
      VARIANTEN.length;
    expect(() => pruefeBudget(haqiqiyJami)).not.toThrow();
  });
});

class FakeDialogClient implements DialogClient {
  calls: Array<{ inputs: Array<{ voice: string; text: string }> }> = [];
  async dialog(
    inputs: Array<{ voice: string; text: string }>,
  ): Promise<string> {
    this.calls.push({ inputs });
    return `url:${this.calls.length}`;
  }
}

describe('sammleDialogNamunalari (variant→ovoz bog`lanishi)', () => {
  // Kod-ko'rikda `daf-voice-samples.ts` uchun topilgan bo'shliqning shu
  // yerdagi ekvivalenti: override noto'g'ri gapiruvchiga tegib ketsa
  // (yoki umuman tegmasa) yugurish baribir "muvaffaqiyatli" tugaydi —
  // faqat uchta bir xil (yoki noto'g'ri) ovoz bilan. Shuning uchun bu
  // test HAR variant uchun Annaning ovozi ALMASHGANI va Jonasniki
  // O'ZGARMAGANI ANIQ shu nomzodga tengligini qadaydi.
  it('har variant uchun Anna nomzod ovozida, Jonas Liamda qoladi', async () => {
    const client = new FakeDialogClient();
    await sammleDialogNamunalari(client, u02d2, stimmen, ['Anna']);

    expect(client.calls).toHaveLength(VARIANTEN.length);
    client.calls.forEach((call, i) => {
      const variant = VARIANTEN[i];
      call.inputs.forEach((input, idx) => {
        const sprecher = u02d2.zeilen[idx].sprecher;
        if (sprecher === 'Anna') {
          expect(input.voice).toBe(variant.stimme);
        } else {
          expect(input.voice).toBe('Liam');
        }
      });
    });
  });

  it('matn tts ?? de bo`yicha o`tadi — `dialogInputs` IMPORT qilingan, ko`chirilmagan', async () => {
    const client = new FakeDialogClient();
    await sammleDialogNamunalari(client, u02d2, stimmen, ['Anna'], [
      VARIANTEN[0],
    ]);
    expect(client.calls[0].inputs.map((x) => x.text)).toEqual(
      u02d2.zeilen.map((z) => z.de),
    );
  });

  it('`--variant` filtri bilan FAQAT o`sha variant chaqiriladi (qayta urinish xavfsiz)', async () => {
    const client = new FakeDialogClient();
    const natija = await sammleDialogNamunalari(
      client,
      u02d2,
      stimmen,
      ['Anna'],
      [VARIANTEN[1]],
    );
    expect(client.calls).toHaveLength(1);
    expect(natija).toEqual([{ variant: VARIANTEN[1], url: 'url:1' }]);
  });

  it('fal.ai xatosi variant nomi bilan boyitilib qayta tashlanadi', async () => {
    const buzuqKlient: DialogClient = {
      dialog: async () => {
        throw new Error('tarmoq xatosi');
      },
    };
    await expect(
      sammleDialogNamunalari(buzuqKlient, u02d2, stimmen, ['Anna'], [
        VARIANTEN[0],
      ]),
    ).rejects.toThrow(/ElevenLabs — Sarah.*tarmoq xatosi/);
  });

  it('gapiruvchisi stimmen.jsonda yo`q bo`lsa TO`XTAYDI (dialogInputs qo`riqchisi)', async () => {
    const client = new FakeDialogClient();
    await expect(
      sammleDialogNamunalari(client, u02d2, { Anna: 'Aria' }, ['Anna']),
    ).rejects.toThrow(/Jonas.*stimmen\.json/);
    // Hech qanday chaqiruv qilinmagan — xato BIRINCHI variantning
    // o'zida, tarmoqqa chiqishdan OLDIN ushlangan.
    expect(client.calls).toHaveLength(0);
  });
});
