import type { FrageFormat } from '../uebung/frage.types';
import { DafMediaFragenService, VORSCHAU_BAUER } from './daf-media-fragen.service';

const config = {
  get: (k: string) => (k === 'R2_PUBLIC_URL' ? 'https://r2.example' : undefined),
};

/** Bazaning eng kichik soxta nusxasi — faqat shu servis o'qiydigan jadvallar. */
function fakePrisma(rows: {
  woerter?: unknown[];
  saetze?: unknown[];
  phrasen?: unknown[];
  dialoge?: unknown[];
}) {
  return {
    dafLexeme: { findMany: jest.fn(async () => rows.woerter ?? []) },
    dafSentence: { findMany: jest.fn(async () => rows.saetze ?? []) },
    dafPhrase: { findMany: jest.fn(async () => rows.phrasen ?? []) },
    dafDialog: { findMany: jest.fn(async () => rows.dialoge ?? []) },
  };
}

function yasa(rows: {
  woerter?: unknown[];
  saetze?: unknown[];
  phrasen?: unknown[];
  dialoge?: unknown[];
}) {
  return new DafMediaFragenService(fakePrisma(rows) as any, config as any);
}

/** Bitta so'z qatori — sukut bo'yicha aktiv (`core: true`) va audiosi bor. */
function w(id: number, de: string, uz: string) {
  return {
    id,
    de,
    uz,
    artikel: null,
    anzeige: null,
    core: true,
    audioKey: `daf/audio/${id}.mp3`,
  };
}

describe('VORSCHAU_BAUER', () => {
  /**
   * ENG MUHIM TEKSHIRUV, VA U TEST EMAS — TIP.
   *
   * `VORSCHAU_BAUER` `Record<FrageFormat, ...>` deb e'lon qilinadi, ya'ni
   * 13-format qo'shilib bu yerga yozilmasa TypeScript build'ni yiqitadi.
   * Testga ishonib bo'lmasdi: yangi format qo'shgan odam testni ham
   * o'zgartirmaydi va sahifa jimgina "hammasi shu" deb turaverardi.
   *
   * Quyidagi test faqat ro'yxat BO'SH EMASLIGINI va har kalit haqiqiy
   * qiymat tashishini tekshiradi — to'liqlikni kompilyator ta'minlaydi.
   */
  it('har format uchun yozuv bor va bo`sh emas', () => {
    const kalitlar = Object.keys(VORSCHAU_BAUER) as FrageFormat[];
    expect(kalitlar.length).toBeGreaterThanOrEqual(12);
    for (const k of kalitlar) expect(VORSCHAU_BAUER[k]).toBeDefined();
  });
});

describe('DafMediaFragenService', () => {
  it('savol JAVOBI bilan qaytadi', async () => {
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima')] });
    const r = await svc.fragen(7);
    const wu = r.find((f) => f.format === 'WORT_UZ')!;
    expect(wu.richtig).toBe('salom');
    expect(wu.options).toContain('salom');
  });

  it('PASSIV so`zdan savol qurilmaydi', async () => {
    // Dvigatel `core: false` so'zni so'ramaydi ham, chalg'ituvchi ham
    // qilmaydi. Oldindan ko'rish shu qoidani AYNAN takrorlashi kerak,
    // aks holda sahifa mavjud bo'lmagan savolni ko'rsatardi.
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima'), { ...w(5, 'und', 'va'), core: false }] });
    const r = await svc.fragen(7);
    expect(r.some((f) => f.richtig === 'va')).toBe(false);
  });

  it('audiosi yo`q so`zdan AUDIO_WORT chiqmaydi', async () => {
    const svc = yasa({ woerter: [1, 2, 3, 4].map((i) => ({ ...w(i, `w${i}`, `u${i}`), audioKey: null })) });
    const r = await svc.fragen(7);
    expect(r.some((f) => f.format === 'AUDIO_WORT')).toBe(false);
  });

  it('BARQAROR: ikki chaqiruv bir xil natija beradi', async () => {
    // Quruvchilar variantlarni aralashtiradi. Urug' barqaror bo'lmasa
    // sahifa har yangilanganda boshqa savol ko'rsatardi va CEO ko'rgan
    // narsasini ikkinchi marta topa olmasdi.
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima')] });
    expect(JSON.stringify(await svc.fragen(7))).toBe(JSON.stringify(await svc.fragen(7)));
  });

  it('BOSHQA bo`lim boshqa urug` oladi', async () => {
    // Aks holda hamma bo'lim bir xil tartibda chiqib, tasodifiylik
    // yo'qolardi.
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima')] });
    expect(JSON.stringify(await svc.fragen(7))).not.toBe(JSON.stringify(await svc.fragen(8)));
  });
});
