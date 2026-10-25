import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DialogeFile,
  GrammatikFile,
  HoerFrage,
  LesetexteFile,
  RedemittelFile,
  SaetzeFile,
  WoerterFile,
} from './unit-inhalt.types';
import type { AudioManifest } from '../media/audio-keys';
import { audioSchluesselFuer } from '../media/audio-keys';
import type { DialogAudioManifest } from './dialog-audio';
import { satzAudioSchluessel, type SatzAudioManifest } from './satz-audio';
import type { BildManifest } from '../media/bild-keys';
import { bildSchluesselFuer } from '../media/bild-keys';
import type { BildPlan } from './bild-plan';
import {
  uhrAudioSchluessel,
  uhrzeitenDesUnits,
  validateUhrzeiten,
  type UhrAudioManifest,
  type UhrzeitenFile,
} from './uhrzeiten';

export interface InhaltFiles {
  woerter: WoerterFile;
  saetze: SaetzeFile;
  dialoge: DialogeFile;
  /**
   * `lesetexte.json` — plakat, chat, e-mail, jadval (audiosiz). Ixtiyoriy:
   * hamma unitda yo'q. Bazada `DafDialog` qatori (`art` bilan), shuning
   * uchun «faylda yo'q» tozalash dialoglar bilan BIR XAT: ikkala fayl
   * kodlari birga hisoblanadi.
   */
  lesetexte?: LesetexteFile;
  grammatik: GrammatikFile;
  redemittel: RedemittelFile;
  /**
   * Ixtiyoriy — audio hali barcha unitlarga yasalmagan va eski
   * chaqiruvchilar (testlar, boshqa unitlar) buni bermasdan chaqiradi.
   * Skript (`daf-inhalt-seed.ts`) `content/daf/a1/audio.json`ni
   * o'qib beradi; xizmatning o'zi diskka tegmaydi.
   */
  audio?: AudioManifest;
  /**
   * Dialog audiosi manifesti — `content/daf/a1/dialog-audio.json`.
   * Ixtiyoriy, `audio` bilan bir xil sabab. `DafDialog.audioKey` HAR
   * upsertda shundan yoziladi: manifest — yagona manba, baza — muhit;
   * yozuv yo'q bo'lsa `null` (eski kalit qolib ketmaydi).
   */
  dialogAudio?: DialogAudioManifest;
  /** `content/daf/a1/satz-audio.json` — sentence audio; optional like `audio`. */
  satzAudio?: SatzAudioManifest;
  /** `content/daf/a1/bilder.json` — picture keys; optional like `audio`. */
  bilder?: BildManifest;
  /** `content/daf/a1/bild-plan.json` — the `tippen` flag per word. */
  bildPlan?: BildPlan;
  /**
   * `content/daf/a1/dialog-bilder.json` — one picture per dialog; optional
   * like `audio`. A dialog missing from it gets `imageKey: null`.
   */
  dialogBilder?: BildManifest;
  /**
   * `content/daf/a1/uhrzeiten.json` — the clock times per section. Absent:
   * the clock table is not touched at all (an old caller, a unit run
   * before the file existed).
   */
  uhrzeiten?: UhrzeitenFile;
  /** `content/daf/a1/uhr-audio.json` — the spoken times, keyed by `zeit`. */
  uhrAudio?: UhrAudioManifest;
}

export interface InhaltSeedReport {
  woerter: number;
  saetze: number;
  dialoge: number;
  /** O'qish matnlari (`lesetexte.json`) — `dialoge` hisobiga kirmaydi. */
  lesetexte: number;
  zeilen: number;
  regeln: number;
  phrasen: number;
  hoerFragen: number;
  /** Clock times written (`DafUhrzeit`); 0 when no file was given. */
  uhrzeiten: number;
  /**
   * Faylda endi YO'Q, lekin bazada BOR so'z soni.
   *
   * O'CHIRILMAYDI (pastdagi katta izohga qarang) — faqat hisoblanadi,
   * shuning uchun drift ko'rinadigan bo'ladi va inson qaror qiladi.
   */
  staleWoerter: number;
}

/** `DafDialog` ga yoziladigan matn: audio dialog yoki o'qish matni. */
interface SeedText {
  id: string;
  section: string;
  art: string;
  titelDe: string;
  titelUz: string;
  sahnaUz?: string;
  zeilen: Array<{
    sprecher: string;
    de: string;
    tts?: string;
    uz: string;
    izohUz?: string;
  }>;
  fragen?: HoerFrage[];
  mitAudio: boolean;
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
    // Audio dialoglar va o'qish matnlari bitta jadvalda (`DafDialog`) turadi:
    // tozalash va yozish ikkalasini BIRGA ko'radi.
    const texte: SeedText[] = [
      ...files.dialoge.dialoge.map((d) => ({
        ...d,
        art: d.art ?? 'DIALOG',
        mitAudio: true,
      })),
      ...(files.lesetexte?.texte ?? []).map((t) => ({ ...t, mitAudio: false })),
    ];
    // Clock times are checked before any write, like the section keys.
    const uhrPlan = files.uhrzeiten
      ? this.uhrPlan(unitCode, files.uhrzeiten, sectionId)
      : null;
    if (uhrPlan) {
      await this.assertNotEmptyFileWipe(
        unitCode,
        unit.id,
        Object.keys(uhrPlan).length === 0,
        'uhrzeiten',
        () =>
          this.prisma.dafUhrzeit.count({
            where: { sectionId: { in: rows.map((r) => r.id) } },
          }),
      );
    }
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
      texte.length === 0,
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
        akzeptiert: w.akzeptiert ?? [],
        order: w.order,
        // Aktiv/passiv farqi: `true` — mashqda so'raladi, `false` — faqat
        // dialog/matnda uchraydi va hech qachon so'ralmaydi.
        core: w.core,
        // Manifest MANBA: undan kalit olib tashlangan bo'lsa bazadagi
        // eskisi ham o'chadi (`null`). «Tegmaslik» tanlansa, R2 da
        // endi yo'q faylga ishora qiladigan so'z qolib, o'quvchi
        // yangramaydigan tugmani ko'rardi.
        audioKey: audioSchluesselFuer(files.audio ?? {}, w.sourceId),
        // Same rule for pictures: the manifest is the source, so a key
        // removed from it clears the stale one.
        imageKey: bildSchluesselFuer(files.bilder ?? {}, w.sourceId),
        bildTippen: files.bildPlan?.[w.sourceId]?.tippen ?? false,
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

    // Faylda endi yo'q gaplarni butunlay o'chiramiz — dialog/ibora kabi,
    // so'z kabi EMAS. `DafAttempt`da `sentenceId` yo'q, ya'ni hech kim
    // bu qatorlarga ishora qilmaydi (klass izohidagi asimmetriyaga
    // qarang), shuning uchun ularni sanab, abadiy saqlab qo'yishning
    // hojati yo'q.
    //
    // O'CHIRISH YOZISHDAN OLDIN sodir bo'lishi SHART: `order` faqat
    // ko'rsatish tartibi va endi NOYOB emas (qarang `DafSentence`dagi
    // izoh) — lekin tartib buzilishining oldini olish uchun baribir
    // avval eskisini olib tashlaymiz. Masalan bo'limning 2-gapi faylda
    // o'chirilsa, qolgan gaplar bir qadam yuqoriga suriladi (3-gap endi
    // 2-o'rinda) — bu HECH QANDAY muammo tug'dirmaydi, chunki qator
    // o'zligi `sourceId` bilan aniqlanadi, `order` esa faqat ko'rinish
    // uchun qayta yoziladi.
    const saetzeSourceIds = files.saetze.saetze.map((s) => s.sourceId);
    await this.prisma.dafSentence.deleteMany({
      where: { unitId: unit.id, sourceId: { notIn: saetzeSourceIds } },
    });

    let saetze = 0;
    for (const [i, s] of files.saetze.saetze.entries()) {
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(s.section) ?? null,
        de: s.de,
        uz: s.uz,
        tts: s.tts ?? null,
        wordCount: s.wordCount,
        origin: s.origin,
        akzeptiert: s.akzeptiert ?? [],
        kontextUz: s.kontextUz ?? null,
        // Manifest is the source, and only an entry made from THIS text
        // counts: an edited sentence keeps no recording of its old words.
        audioKey: satzAudioSchluessel(files.satzAudio ?? {}, s),
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

    // Faylda endi yo'q dialoglarni butunlay o'chiramiz. Avval SATRLARI —
    // FK `ON DELETE RESTRICT`, aks holda dialogni o'chirish rad etiladi.
    // Hech kim boshqa joydan bunga ishora qilmaydi — o'chirish xavfsiz.
    const dialogCodes = texte.map((d) => d.id);
    const staleDialoge = await this.prisma.dafDialog.findMany({
      where: { unitId: unit.id, code: { notIn: dialogCodes } },
      select: { id: true },
    });
    if (staleDialoge.length > 0) {
      const staleDialogIds = staleDialoge.map((d) => d.id);
      // Savollar satrlardan OLDIN — `DafHoerFrage.dialogId` ham
      // `ON DELETE RESTRICT`. Bu qator yozilmasa, dialogni o'chirish
      // «faqat qo'shadi» degan migratsiyaga qaramay yiqiladi.
      await this.prisma.dafHoerFrage.deleteMany({
        where: { dialogId: { in: staleDialogIds } },
      });
      await this.prisma.dafDialogLine.deleteMany({
        where: { dialogId: { in: staleDialogIds } },
      });
      await this.prisma.dafDialog.deleteMany({
        where: { id: { in: staleDialogIds } },
      });
    }

    let dialoge = 0;
    let lesetexte = 0;
    let zeilen = 0;
    let hoerFragen = 0;
    for (const d of texte) {
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(d.section) as number,
        titelDe: d.titelDe,
        titelUz: d.titelUz,
        sahnaUz: d.sahnaUz ?? null,
        art: d.art,
        // O'qish matnida audio yo'q — manifestda kalit bo'lsa ham yozilmaydi.
        audioKey: d.mitAudio ? (files.dialogAudio?.[d.id]?.key ?? null) : null,
        imageKey: bildSchluesselFuer(files.dialogBilder ?? {}, d.id),
      };
      const row = await this.prisma.dafDialog.upsert({
        where: { code: d.id },
        create: { code: d.id, ...data },
        update: data,
      });
      if (d.mitAudio) dialoge += 1;
      else lesetexte += 1;

      for (const [i, z] of d.zeilen.entries()) {
        const order = i + 1;
        const zData = {
          sprecher: z.sprecher,
          de: z.de,
          tts: z.tts ?? null,
          uz: z.uz,
          izohUz: z.izohUz ?? null,
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

      // Eshitish savollari — `code` = dialog kaliti + tartib. Kalit
      // dialog ICHIDAGI tartibdan: o'rtadagi savol o'chirilsa qolgani
      // qayta raqamlanadi, ORTIQDA qolgani pastda o'chiriladi.
      for (const [i, f] of (d.fragen ?? []).entries()) {
        const order = i + 1;
        const fData = {
          frageDe: f.frageDe,
          frageUz: f.frageUz,
          richtig: f.richtig,
          falsch: f.falsch,
        };
        await this.prisma.dafHoerFrage.upsert({
          where: { code: `${d.id}-f${order}` },
          create: {
            code: `${d.id}-f${order}`,
            dialogId: row.id,
            order,
            ...fData,
          },
          update: fData,
        });
        hoerFragen += 1;
      }
      await this.prisma.dafHoerFrage.deleteMany({
        where: { dialogId: row.id, order: { gt: (d.fragen ?? []).length } },
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

    // Clock times: every section of the unit is synced to the file (a time
    // removed from it goes). Nothing points at a row — an attempt keeps
    // `itemType`/`itemId` only — so deleting is safe, as for sentences.
    let uhrzeiten = 0;
    if (uhrPlan) {
      for (const row of rows) {
        const zeiten = uhrPlan[row.code] ?? [];
        await this.prisma.dafUhrzeit.deleteMany({
          where: { sectionId: row.id, zeit: { notIn: zeiten } },
        });
        for (const zeit of zeiten) {
          // The manifest is the source: no current recording → `null`.
          const data = {
            audioKey: uhrAudioSchluessel(files.uhrAudio ?? {}, zeit),
          };
          await this.prisma.dafUhrzeit.upsert({
            where: { sectionId_zeit: { sectionId: row.id, zeit } },
            create: { sectionId: row.id, zeit, ...data },
            update: data,
          });
          uhrzeiten += 1;
        }
      }
    }

    const report = {
      woerter,
      saetze,
      dialoge,
      lesetexte,
      zeilen,
      regeln,
      phrasen,
      hoerFragen,
      uhrzeiten,
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

  /**
   * This unit's clock times by section code; throws on a broken time or a
   * section the unit does not have — before anything is written.
   */
  private uhrPlan(
    unitCode: string,
    file: UhrzeitenFile,
    sectionId: Map<string, number>,
  ): Record<string, string[]> {
    const plan = uhrzeitenDesUnits(file, unitCode);
    const fehler = validateUhrzeiten(
      Object.fromEntries(
        Object.entries(plan).map(([k, z]) => [k, z.map((zeit) => ({ zeit }))]),
      ),
    );
    const noma = Object.keys(plan).filter((c) => !sectionId.has(c));
    if (noma.length > 0) {
      fehler.push(`Bazada yo'q bo'lim kaliti: ${noma.join(', ')}`);
    }
    if (fehler.length > 0) {
      throw new Error(`uhrzeiten.json: ${fehler.join('; ')}`);
    }
    return plan;
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
      ...(files.lesetexte?.texte ?? []).map((t) => t.section),
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
