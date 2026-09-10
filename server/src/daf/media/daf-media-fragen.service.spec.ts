import type { FrageFormat } from '../uebung/frage.types';
import {
  DafMediaFragenService,
  VORSCHAU_BAUER,
} from './daf-media-fragen.service';

const config = {
  get: (k: string) =>
    k === 'R2_PUBLIC_URL' ? 'https://r2.example' : undefined,
};

/**
 * Bazaning eng kichik soxta nusxasi — faqat shu servis o'qiydigan jadvallar.
 *
 * `dafSection` ATAYLAB qo'shildi: xizmat endi so'ralgan bo'limning o'zi
 * bilan chegaralanmaydi — `uebung.service.ts`dagi `baueKandidaten` kabi
 * shu UNIT ichidagi OLDINGI bo'limlar materialini ham chalg'ituvchi puliga
 * qo'shadi. Bu yordamchi (`fakePrisma`/`yasa`) faqat BITTA bo'limli
 * sinovlar uchun — pul birlashtirishni sinaydigan test o'z prisma
 * soxtasini pastda alohida quradi, chunki u `where.sectionId.in`ni
 * haqiqiy filtrlashi kerak (bu yerdagi soxta filtrlamaydi — bitta
 * bo'limli sinovlar uchun bunga ehtiyoj yo'q).
 */
function fakePrisma(rows: {
  woerter?: unknown[];
  saetze?: unknown[];
  phrasen?: unknown[];
  dialoge?: unknown[];
}) {
  const section = { id: 7, unitId: 1, order: 1 };
  return {
    dafSection: {
      findUnique: jest.fn(async () => section),
      findMany: jest.fn(async () => [section]),
    },
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
    const svc = yasa({
      woerter: [
        w(1, 'hallo', 'salom'),
        w(2, 'danke', 'rahmat'),
        w(3, 'wer', 'kim'),
        w(4, 'was', 'nima'),
      ],
    });
    const r = await svc.fragen(7);
    const wu = r.find((f) => f.format === 'WORT_UZ')!;
    expect(wu.richtig).toBe('salom');
    expect(wu.options).toContain('salom');
  });

  it('PASSIV so`zdan savol qurilmaydi VA u chalg`ituvchi ham bo`lmaydi', async () => {
    // Dvigatel `core: false` so'zni so'ramaydi ham, chalg'ituvchi ham
    // qilmaydi. Oldindan ko'rish shu qoidani AYNAN takrorlashi kerak,
    // aks holda sahifa mavjud bo'lmagan savolni ko'rsatardi.
    //
    // Ikkala tarafni ham tekshiramiz: `richtig === 'va'` faqat SO'RALISHNI
    // yopadi — passiv so'z variantlar ichida (`options`) chalg'ituvchi
    // sifatida chiqib qolsa ham shu tekshiruv sezmasdi.
    const svc = yasa({
      woerter: [
        w(1, 'hallo', 'salom'),
        w(2, 'danke', 'rahmat'),
        w(3, 'wer', 'kim'),
        w(4, 'was', 'nima'),
        { ...w(5, 'und', 'va'), core: false },
      ],
    });
    const r = await svc.fragen(7);
    expect(r.some((f) => f.richtig === 'va')).toBe(false);
    expect(r.some((f) => f.options.includes('va'))).toBe(false);
    expect(r.some((f) => f.options.includes('und'))).toBe(false);
  });

  it('audiosi yo`q so`zdan AUDIO_WORT chiqmaydi', async () => {
    const svc = yasa({
      woerter: [1, 2, 3, 4].map((i) => ({
        ...w(i, `w${i}`, `u${i}`),
        audioKey: null,
      })),
    });
    const r = await svc.fragen(7);
    expect(r.some((f) => f.format === 'AUDIO_WORT')).toBe(false);
  });

  it('BARQAROR: ikki chaqiruv bir xil natija beradi', async () => {
    // Quruvchilar variantlarni aralashtiradi. Urug' barqaror bo'lmasa
    // sahifa har yangilanganda boshqa savol ko'rsatardi va CEO ko'rgan
    // narsasini ikkinchi marta topa olmasdi.
    const svc = yasa({
      woerter: [
        w(1, 'hallo', 'salom'),
        w(2, 'danke', 'rahmat'),
        w(3, 'wer', 'kim'),
        w(4, 'was', 'nima'),
      ],
    });
    expect(JSON.stringify(await svc.fragen(7))).toBe(
      JSON.stringify(await svc.fragen(7)),
    );
  });

  it('BOSHQA bo`lim boshqa urug` oladi', async () => {
    // Aks holda hamma bo'lim bir xil tartibda chiqib, tasodifiylik
    // yo'qolardi.
    const svc = yasa({
      woerter: [
        w(1, 'hallo', 'salom'),
        w(2, 'danke', 'rahmat'),
        w(3, 'wer', 'kim'),
        w(4, 'was', 'nima'),
      ],
    });
    expect(JSON.stringify(await svc.fragen(7))).not.toBe(
      JSON.stringify(await svc.fragen(8)),
    );
  });

  it('chalg`ituvchi puli UNIT ICHIDAGI OLDINGI bo`limlar bilan birlashtiriladi', async () => {
    // `baueKandidaten` (`uebung.service.ts`) chalg'ituvchilarni SHU bo'lim
    // bilan birga undan oldingi (kichikroq `order`, shu unit) bo'limlar
    // materialidan yig'adi. Bo'lim 8 o'zida atigi 3 ta ibora bilan keladi:
    // `ZUORDNEN` oltitasini, `REAKTION` esa kamida to'rttasini (o'zi + uch
    // chalg'ituvchi) talab qiladi — ikkalasi ham FAQAT bo'lim 8 ustida
    // qurilib bo'lmaydi. Lekin bo'lim 7 (oldingi, shu unit) bilan
    // birlashtirilsa olti ibora bo'ladi va ikkalasi ham quriladi. Buni
    // sinash uchun soxta prisma HAQIQATDA `where.sectionId`ni (yagona
    // qiymat yoki `{in:[...]}`) hisobga olib filtrlaydi — yuqoridagi
    // `fakePrisma` buni qilmaydi, chunki bitta bo'limli sinovlarga kerak
    // emas edi.
    const section1 = { id: 7, unitId: 1, order: 1 };
    const section2 = { id: 8, unitId: 1, order: 2 };
    const phrasenBySection = [
      { id: 1, sectionId: 7, funktionUz: 'f1', de: 'd1', uz: 'u1' },
      { id: 2, sectionId: 7, funktionUz: 'f2', de: 'd2', uz: 'u2' },
      { id: 3, sectionId: 7, funktionUz: 'f3', de: 'd3', uz: 'u3' },
      { id: 4, sectionId: 8, funktionUz: 'f4', de: 'd4', uz: 'u4' },
      { id: 5, sectionId: 8, funktionUz: 'f5', de: 'd5', uz: 'u5' },
      { id: 6, sectionId: 8, funktionUz: 'f6', de: 'd6', uz: 'u6' },
    ];
    const bySectionIdFilter = (rows: Array<{ sectionId: number }>) =>
      jest.fn(async (args: any) => {
        const cond = args?.where?.sectionId;
        const ids: number[] =
          cond && typeof cond === 'object' && Array.isArray(cond.in)
            ? cond.in
            : [cond];
        return rows.filter((r) => ids.includes(r.sectionId));
      });
    const prisma = {
      dafSection: {
        findUnique: jest.fn(async () => section2),
        findMany: jest.fn(async () => [section1, section2]),
      },
      dafLexeme: { findMany: jest.fn(async () => []) },
      dafSentence: { findMany: jest.fn(async () => []) },
      dafPhrase: { findMany: bySectionIdFilter(phrasenBySection) },
      dafDialog: { findMany: jest.fn(async () => []) },
    };
    const svc = new DafMediaFragenService(prisma as any, config as any);
    const r = await svc.fragen(8);
    expect(r.some((f) => f.format === 'ZUORDNEN')).toBe(true);
    expect(r.some((f) => f.format === 'REAKTION')).toBe(true);
  });
});
