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
}

/**
 * Unitning matnini bazaga yozadi. Idempotent: barqaror kalitlar bo'yicha
 * yangilaydi, takrorlamaydi.
 *
 * Bo'lim kalitlari YOZISHDAN OLDIN tekshiriladi. Yarim yozilgan holat
 * eng yomon natija: matnning bir qismi bazada, qolgani yo'q, va qaysi
 * qismi yetib borgani faqat qo'lda aniqlanadi.
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

    let woerter = 0;
    for (const w of files.woerter.woerter) {
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
      };
      await this.prisma.dafLexeme.upsert({
        where: { sourceId: w.sourceId },
        create: { sourceId: w.sourceId, ...data },
        update: data,
      });
      woerter += 1;
    }

    let saetze = 0;
    for (const [i, s] of files.saetze.saetze.entries()) {
      const order = i + 1;
      const data = {
        sectionId: sectionId.get(s.section) ?? null,
        de: s.de,
        uz: s.uz,
        tts: s.tts ?? null,
        wordCount: s.wordCount,
        origin: s.origin,
      };
      await this.prisma.dafSentence.upsert({
        where: { unitId_order: { unitId: unit.id, order } },
        create: { unitId: unit.id, order, ...data },
        update: data,
      });
      saetze += 1;
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
    }

    let regeln = 0;
    for (const r of files.grammatik.regeln) {
      const sourceId = `${unitCode}-${r.section}-regel`;
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(r.section) ?? null,
        titleDe: r.titelDe,
        titleUz: r.titelUz,
        erklaerungUz: r.erklaerungUz,
        // `code`/`explanationEn` DiB davridan qolgan majburiy ustunlar —
        // yangi unit matnida ingliz izoh yo'q, shuning uchun so'z uchun
        // qilingani kabi bo'sh qoldiriladi; `code` sifatida `sourceId`
        // ishlatiladi, chunki u allaqachon yagona.
        code: sourceId,
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
    }

    let phrasen = 0;
    for (const [i, p] of files.redemittel.phrasen.entries()) {
      const code = `${p.section}-${p.funktion}-${i + 1}`;
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

    const report = { woerter, saetze, dialoge, zeilen, regeln, phrasen };
    this.logger.log(`${unitCode} matni: ${JSON.stringify(report)}`);
    return report;
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
