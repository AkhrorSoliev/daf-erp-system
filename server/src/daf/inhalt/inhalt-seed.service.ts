import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DialogeFile,
  GrammatikFile,
  RedemittelFile,
  SaetzeFile,
  WoerterFile,
} from './unit-inhalt.types';

export interface InhaltFiles {
  woerter: WoerterFile;
  saetze: SaetzeFile;
  dialoge: DialogeFile;
  grammatik: GrammatikFile;
  redemittel: RedemittelFile;
}

export interface InhaltSeedReport {
  woerter: number;
  saetze: number;
  dialoge: number;
  zeilen: number;
  regeln: number;
  phrasen: number;
  /**
   * Faylda endi YO'Q, lekin bazada BOR so'z soni.
   *
   * O'CHIRILMAYDI (pastdagi katta izohga qarang) — faqat hisoblanadi,
   * shuning uchun drift ko'rinadigan bo'ladi va inson qaror qiladi.
   */
  staleWoerter: number;
}

/**
 * Unitning matnini bazaga yozadi. Idempotent: barqaror kalitlar bo'yicha
 * yangilaydi, takrorlamaydi.
 *
 * Bo'lim kalitlari YOZISHDAN OLDIN tekshiriladi. Yarim yozilgan holat
 * eng yomon natija: matnning bir qismi bazada, qolgani yo'q, va qaysi
 * qismi yetib borgani faqat qo'lda aniqlanadi.
 *
 * ## Kontent fayllari TAHRIRLANADI — bu servis shunga mo'ljallangan
 *
 * 11 ta unit hali oldinda va ularning har biri necha marta qayta
 * ko'riladi: so'z/gap/dialog/qoida o'chadi, qo'shiladi, tartibi
 * o'zgaradi. Shuning uchun ikkita narsa muhim:
 *
 * 1. **Kalitlar POZITSIYAGA emas, MAZMUNGA bog'liq bo'lishi kerak.**
 *    `DafPhrase.code` va `DafGrammar.sourceId` bo'lim+funksiya/tartib
 *    ichida hisoblanadi, butun massiv bo'yicha emas — aks holda bitta
 *    o'rtadagi yozuvni o'chirish/qo'shish undan KEYINGI hamma yozuvning
 *    kalitini o'zgartirib, ularni yangi qator sifatida qayta yaratardi
 *    (eskisi esa orfan bo'lib qolardi).
 * 2. **"Faylda yo'q, bazada bor" qatorlar TIZIMLI ravishda paydo
 *    bo'ladi** — bu xato emas, tahrirlashning tabiiy natijasi. Ularga
 *    ikki xil munosabat bor, ATAYLAB, va farq nimaga ISHORA
 *    qilinishida, jadval nomida emas:
 *
 *    - `DafSentence`, `DafDialogLine`, `DafGrammarBeispiel`, `DafPhrase`,
 *      `DafDialog` — hech kim ularga ishora qilmaydi. `DafAttempt`da
 *      `sentenceId` YO'Q — gap qaysi urinishga tegishli ekani
 *      lexeme/format/dars orqali biladi, gap qatorining o'ziga emas.
 *      Shuning uchun stale qatorni O'CHIRISH xavfsiz: baza faylni aynan
 *      aks ettiradi, hech narsa yo'qolmaydi. Bu besh jadval bir xil
 *      qoida bilan ishlaydi: `sourceId`/`code` bo'yicha upsert, keyin
 *      faylda yo'q qolganlarni o'chirish.
 *    - `DafLexeme` — talabaning `DafLexemeState` qatori `lexemeId`ga
 *      ISHORA qiladi. So'zni o'chirish talabaning haqiqiy Leitner
 *      tarixini yo'q qilardi. Shuning uchun u O'CHIRILMAYDI — faqat
 *      soni hisoblanadi va hisobotda `staleWoerter` sifatida
 *      qaytariladi, inson ko'rib qaror qilsin deb.
 *
 * 3. **Bo'sh to'plam ≠ "hammasini o'chir".** `saetze`/`dialoge`/
 *    `redemittel` to'plami BO'SH kelsa-yu, bazada shu unit uchun qator
 *    ALLAQACHON bor bo'lsa, seed to'xtaydi va hech narsani o'chirmaydi —
 *    bo'sh massiv chala yozilgan fayldan ham, haqiqatan bo'sh mazmundan
 *    ham farqlanmaydi, shuning uchun bazadagi mavjudlik so'raladi
 *    (`assertNotEmptyFileWipe`). Bazada hali hech narsa yo'q bo'lsa
 *    (unit hali yozilmagan), jim davom etadi.
 */
@Injectable()
export class InhaltSeedService {
  private readonly logger = new Logger(InhaltSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(unitCode: string, files: InhaltFiles): Promise<InhaltSeedReport> {
    const unit = await this.prisma.dafUnit.findFirst({
      where: { code: unitCode },
      select: { id: true },
    });
    if (!unit) throw new Error(`Bazada yo'q unit: ${unitCode}`);

    const rows = await this.prisma.dafSection.findMany({
      where: { unitId: unit.id },
      select: { id: true, code: true },
    });
    const sectionId = new Map(rows.map((r) => [r.code, r.id]));

    this.assertSectionsKnown(files, sectionId);
    await this.assertNotEmptyFileWipe(
      unitCode,
      unit.id,
      files.saetze.saetze.length === 0,
      'saetze',
      () => this.prisma.dafSentence.count({ where: { unitId: unit.id } }),
    );
    await this.assertNotEmptyFileWipe(
      unitCode,
      unit.id,
      files.dialoge.dialoge.length === 0,
      'dialoge',
      () => this.prisma.dafDialog.count({ where: { unitId: unit.id } }),
    );
    await this.assertNotEmptyFileWipe(
      unitCode,
      unit.id,
      files.redemittel.phrasen.length === 0,
      'redemittel',
      () => this.prisma.dafPhrase.count({ where: { unitId: unit.id } }),
    );

    let woerter = 0;
    const wortSourceIds: string[] = [];
    for (const w of files.woerter.woerter) {
      wortSourceIds.push(w.sourceId);
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(w.section) ?? null,
        de: w.de,
        en: '',
        uz: w.uz,
        tts: w.tts ?? null,
        artikel: w.artikel ?? null,
        plural: w.plural ?? null,
        // Ko'rgazma raqami — faqat sonlar bo'limida bor, qolganida `null`.
        anzeige: w.anzeige ?? null,
        order: w.order,
        // Aktiv/passiv farqi: `true` — mashqda so'raladi, `false` — faqat
        // dialog/matnda uchraydi va hech qachon so'ralmaydi.
        core: w.core,
      };
      await this.prisma.dafLexeme.upsert({
        where: { sourceId: w.sourceId },
        create: { sourceId: w.sourceId, ...data },
        update: data,
      });
      woerter += 1;
    }
    // O'CHIRILMAYDI — talaba `DafLexemeState`si so'zga bog'langan; faqat
    // hisoblanadi (klass izohidagi asimmetriyaga qarang).
    const staleWoerter = await this.prisma.dafLexeme.count({
      where: { unitId: unit.id, sourceId: { notIn: wortSourceIds } },
    });

    let saetze = 0;
    const saetzeSourceIds: string[] = [];
    for (const [i, s] of files.saetze.saetze.entries()) {
      saetzeSourceIds.push(s.sourceId);
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(s.section) ?? null,
        de: s.de,
        uz: s.uz,
        tts: s.tts ?? null,
        wordCount: s.wordCount,
        origin: s.origin,
        // Ko'rsatish tartibi — hech kim bu qatorga ISHORA qilmaydi,
        // shuning uchun bu faqat displey uchun, identifikatsiya emas.
        order: i + 1,
      };
      await this.prisma.dafSentence.upsert({
        where: { sourceId: s.sourceId },
        create: { sourceId: s.sourceId, ...data },
        update: data,
      });
      saetze += 1;
    }
    // Faylda endi yo'q gaplarni butunlay o'chiramiz — dialog/ibora kabi,
    // so'z kabi EMAS. `DafAttempt`da `sentenceId` yo'q, ya'ni hech kim
    // bu qatorlarga ishora qilmaydi (klass izohidagi asimmetriyaga
    // qarang), shuning uchun ularni sanab, abadiy saqlab qo'yishning
    // hojati yo'q.
    await this.prisma.dafSentence.deleteMany({
      where: { unitId: unit.id, sourceId: { notIn: saetzeSourceIds } },
    });

    // Faylda endi yo'q dialoglarni butunlay o'chiramiz. Avval SATRLARI —
    // FK `ON DELETE RESTRICT`, aks holda dialogni o'chirish rad etiladi.
    // Hech kim boshqa joydan bunga ishora qilmaydi — o'chirish xavfsiz.
    const dialogCodes = files.dialoge.dialoge.map((d) => d.id);
    const staleDialoge = await this.prisma.dafDialog.findMany({
      where: { unitId: unit.id, code: { notIn: dialogCodes } },
      select: { id: true },
    });
    if (staleDialoge.length > 0) {
      const staleDialogIds = staleDialoge.map((d) => d.id);
      await this.prisma.dafDialogLine.deleteMany({
        where: { dialogId: { in: staleDialogIds } },
      });
      await this.prisma.dafDialog.deleteMany({
        where: { id: { in: staleDialogIds } },
      });
    }

    let dialoge = 0;
    let zeilen = 0;
    for (const d of files.dialoge.dialoge) {
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(d.section) as number,
        titelDe: d.titelDe,
        titelUz: d.titelUz,
      };
      const row = await this.prisma.dafDialog.upsert({
        where: { code: d.id },
        create: { code: d.id, ...data },
        update: data,
      });
      dialoge += 1;

      for (const [i, z] of d.zeilen.entries()) {
        const order = i + 1;
        const zData = {
          sprecher: z.sprecher,
          de: z.de,
          tts: z.tts ?? null,
          uz: z.uz,
        };
        await this.prisma.dafDialogLine.upsert({
          where: { dialogId_order: { dialogId: row.id, order } },
          create: { dialogId: row.id, order, ...zData },
          update: zData,
        });
        zeilen += 1;
      }

      // O'chiriladi — dialog satriga hech kim ishora qilmaydi. Fayldan
      // o'rtadagi satr o'chirilsa, qolganlari qayta raqamlanadi va faqat
      // ORTIQDA qolgan (endi ishlatilmagan) `order` qatorlari qoladi.
      await this.prisma.dafDialogLine.deleteMany({
        where: { dialogId: row.id, order: { gt: d.zeilen.length } },
      });
    }

    let regeln = 0;
    // Bo'lim+tartib ichida hisoblanadi — butun massiv indeksi EMAS, aks
    // holda bir bo'limga qoida qo'shish/o'chirish boshqa bo'limlarning
    // sourceId'sini ham siljitib yuborardi.
    const sectionRegelSeq = new Map<string, number>();
    for (const r of files.grammatik.regeln) {
      const n = (sectionRegelSeq.get(r.section) ?? 0) + 1;
      sectionRegelSeq.set(r.section, n);
      // `r.section` allaqachon unit kodini o'z ichiga oladi (`u01-s1`) —
      // oldin bu yerga yana `unitCode` qo'shilib, `u01-u01-s1-regel`
      // kabi ikki marta prefikslangan kalit yasalar edi.
      const sourceId = `${r.section}-regel-${n}`;
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(r.section) ?? null,
        titleDe: r.titelDe,
        titleUz: r.titelUz,
        erklaerungUz: r.erklaerungUz,
        // `explanationEn` DiB davridan qolgan majburiy ustun — yangi
        // unit matnida ingliz izoh yo'q, shuning uchun so'z uchun
        // qilingani kabi bo'sh qoldiriladi. `code` endi ixtiyoriy
        // (migratsiya bilan NOT NULL olib tashlandi) — yangi qoidalarga
        // yozilmaydi, chunki `sourceId`ning o'zi allaqachon yagona.
        explanationEn: '',
      };
      const row = await this.prisma.dafGrammar.upsert({
        where: { sourceId },
        create: { sourceId, ...data },
        update: data,
      });
      regeln += 1;

      for (const [i, b] of r.beispiele.entries()) {
        const order = i + 1;
        const bData = { de: b.de, tts: b.tts ?? null, uz: b.uz };
        await this.prisma.dafGrammarBeispiel.upsert({
          where: { grammarId_order: { grammarId: row.id, order } },
          create: { grammarId: row.id, order, ...bData },
          update: bData,
        });
      }

      // O'chiriladi — misolga hech kim ishora qilmaydi. Sabab satr
      // o'chirishdagi bilan bir xil: qayta raqamlangach ortiqda qolgan
      // `order`lar.
      await this.prisma.dafGrammarBeispiel.deleteMany({
        where: { grammarId: row.id, order: { gt: r.beispiele.length } },
      });
    }

    let phrasen = 0;
    // Bo'lim+funksiya ichida hisoblanadi — butun massiv indeksi EMAS,
    // aks holda bir funksiyaga ibora qo'shish/o'chirish undan KEYINGI
    // hamma iboraning kodini siljitardi (masalan `begruessen`dan keyin
    // kelgan `vorstellen-1` ham qayta nomlanardi), eskisi orfan bo'lib
    // qolardi.
    const sectionFunktionSeq = new Map<string, number>();
    const phraseCodes: string[] = [];
    for (const p of files.redemittel.phrasen) {
      const key = `${p.section}::${p.funktion}`;
      const n = (sectionFunktionSeq.get(key) ?? 0) + 1;
      sectionFunktionSeq.set(key, n);
      const code = `${p.section}-${p.funktion}-${n}`;
      phraseCodes.push(code);
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(p.section) as number,
        funktion: p.funktion,
        funktionUz: p.funktionUz,
        de: p.de,
        tts: p.tts ?? null,
        uz: p.uz,
      };
      await this.prisma.dafPhrase.upsert({
        where: { code },
        create: { code, ...data },
        update: data,
      });
      phrasen += 1;
    }
    // O'chiriladi — iboraga hech kim ishora qilmaydi.
    await this.prisma.dafPhrase.deleteMany({
      where: { unitId: unit.id, code: { notIn: phraseCodes } },
    });

    const report = {
      woerter,
      saetze,
      dialoge,
      zeilen,
      regeln,
      phrasen,
      staleWoerter,
    };
    this.logger.log(`${unitCode} matni: ${JSON.stringify(report)}`);
    return report;
  }

  /**
   * Fayldagi to'plam BO'SH bo'lsa-yu, bazada shu unit uchun qatorlar
   * BOR bo'lsa, to'xtaydi — hech narsani o'chirmaydi.
   *
   * Sabab: `dialoge`/`redemittel` tozalash `notIn: <fayldagi kodlar>`
   * bilan ishlaydi. Massiv BO'SH bo'lsa, `notIn: []` HAMMA qatorga mos
   * keladi — yuklovchi xatosi, chala yozilgan fayl yoki buzuq JSON
   * (`{"dialoge": []}`) ham xuddi shunday ko'rinadi. Ularni haqiqiy
   * "bu unitda hali dialog yo'q" holatidan farqlashning yagona yo'li —
   * bazada ALLAQACHON qator bormi, deb so'rash: bo'lsa, fayl gumon
   * ostida va o'chirish to'xtatiladi; bo'lmasa (hali hech narsa
   * yozilmagan unit), jim davom etadi.
   */
  private async assertNotEmptyFileWipe(
    unitCode: string,
    unitId: number,
    fileIsEmpty: boolean,
    fileKey: string,
    countExisting: () => Promise<number>,
  ): Promise<void> {
    if (!fileIsEmpty) return;
    const existing = await countExisting();
    if (existing > 0) {
      throw new Error(
        `${unitCode}: '${fileKey}' fayli bo'sh ko'rinadi, lekin bazada ${existing} ta qator bor (unitId=${unitId}) — buzuq yoki chala o'qilgan fayldan xato o'chirishning oldini olish uchun seed hech narsani o'chirmaydi. Faylni tekshiring.`,
      );
    }
  }

  /** Noma'lum bo'lim kaliti bo'lsa, BIRORTA yozuvdan oldin to'xtaydi. */
  private assertSectionsKnown(
    files: InhaltFiles,
    sectionId: Map<string, number>,
  ): void {
    const used = new Set<string>([
      ...files.woerter.woerter.map((w) => w.section),
      ...files.saetze.saetze.map((s) => s.section),
      ...files.dialoge.dialoge.map((d) => d.section),
      ...files.grammatik.regeln.map((r) => r.section),
      ...files.redemittel.phrasen.map((p) => p.section),
    ]);

    const noma = [...used].filter((c) => !sectionId.has(c));
    if (noma.length > 0) {
      throw new Error(
        `Bazada yo'q bo'lim kaliti: ${noma.join(', ')} — xarita seed qilinganmi?`,
      );
    }
  }
}
