import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { planLessons } from './kurs-lessons';
import type { KursFile, KursUnitSpec } from './kurs.types';

export interface KursSeedReport {
  units: number;
  sections: number;
  lessons: number;
  retired: number;
}

/**
 * Xaritani bazaga yozadi. Idempotent: qayta yuritish yangilaydi,
 * takrorlamaydi — barqaror kalitlar (`code`, `sourceId`) bo'yicha ishlaydi.
 */
@Injectable()
export class KursSeedService {
  private readonly logger = new Logger(KursSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(file: KursFile): Promise<KursSeedReport> {
    let sections = 0;
    let lessons = 0;
    const liveCodes = new Set(file.units.map((u) => u.code));

    // Nafaqaga chiqarish UNIT UPSERT'LARIDAN OLDIN yuritiladi. Migratsiya
    // eski A1 unitlarini allaqachon manfiy `order`ga o'tkazgan bo'lishi
    // kerak — lekin migratsiya hali yetib bormagan bazada (tiklangan
    // nusxa, `db push` muhiti) eski unit hali `(level, order)` joyini
    // egallab turadi, va YANGI unitning birinchi `upsert`i xuddi shu
    // juftlikka `create` qilishga urinib, `@@unique([level, order])`da
    // yiqiladi. Avval bo'shatib, keyin band qilish shu poyga holatini
    // yo'qqa chiqaradi.
    const retired = await this.retireOld(file.level, liveCodes);

    for (const u of file.units) {
      const unit = await this.prisma.dafUnit.upsert({
        where: { code: u.code },
        create: {
          code: u.code,
          level: file.level,
          order: u.order,
          titleDe: u.titleDe,
          titleUz: u.titleUz,
        },
        update: {
          order: u.order,
          titleDe: u.titleDe,
          titleUz: u.titleUz,
          retiredAt: null,
        },
      });

      await this.assertNoOrphanSections(unit.id, u);

      const sectionIdByCode = new Map<string, number>();

      for (const s of u.sections) {
        const row = await this.prisma.dafSection.upsert({
          where: { code: s.code },
          create: {
            code: s.code,
            unitId: unit.id,
            order: s.order,
            titleDe: s.titleDe,
            titleUz: s.titleUz,
            grammar: s.grammar,
            grammarUz: s.grammarUz,
            wordBudget: s.wordBudget,
          },
          update: {
            unitId: unit.id,
            order: s.order,
            titleDe: s.titleDe,
            titleUz: s.titleUz,
            grammar: s.grammar,
            grammarUz: s.grammarUz,
            wordBudget: s.wordBudget,
          },
        });
        sectionIdByCode.set(s.code, row.id);
        sections += 1;
      }

      for (const l of planLessons(u)) {
        const sectionId =
          l.sectionCode === null
            ? null
            : (sectionIdByCode.get(l.sectionCode) ?? null);

        await this.prisma.dafLesson.upsert({
          where: { sourceId: l.sourceId },
          create: {
            sourceId: l.sourceId,
            unitId: unit.id,
            sectionId,
            order: l.order,
            kind: l.kind,
            titleDe: l.titleDe,
            titleUz: l.titleUz,
          },
          update: {
            unitId: unit.id,
            sectionId,
            order: l.order,
            kind: l.kind,
            titleDe: l.titleDe,
            titleUz: l.titleUz,
          },
        });
        lessons += 1;
      }
    }

    this.logger.log(
      `A1 xaritasi: ${file.units.length} unit, ${sections} bo'lim, ${lessons} seans, ${retired} nafaqa`,
    );

    return { units: file.units.length, sections, lessons, retired };
  }

  /**
   * Unit ichida xaritada yo'q bo'lim kodi qolib ketganini tekshiradi.
   *
   * `dafSection.upsert` faqat `code` bo'yicha ishlaydi: bo'lim nomi
   * o'zgartirilsa yoki xaritadan olib tashlansa, eski qator yangilanmaydi
   * ham, nafaqaga chiqarilmaydi ham — jonli unitga yopishib qoladi, o'z
   * lug'ati va darslari bilan yetim bo'lib. Almashtiruvchi bo'lim xuddi
   * shu `order`ni olsa, `@@unique([unitId, order])` yarim yo'lda yiqiladi.
   *
   * Bu yerda rekonsiliatsiya QILINMAYDI — keyingi reja ishi. Faqat ovozli
   * to'xtaydi: sukut buzilishdan ko'ra ochiq xatolik yaxshiroq.
   */
  private async assertNoOrphanSections(
    unitId: number,
    unit: KursUnitSpec,
  ): Promise<void> {
    const liveCodes = new Set(unit.sections.map((s) => s.code));
    const existing = await this.prisma.dafSection.findMany({
      where: { unitId },
      select: { code: true },
    });
    const orphans = existing
      .map((s) => s.code)
      .filter((code) => !liveCodes.has(code));

    if (orphans.length > 0) {
      throw new Error(
        `Unit "${unit.code}" bazada bo'lim kodi(lari)ga ega, lekin xaritada yo'q: ` +
          `${orphans.join(', ')}. Xarita bo'lim kodini o'zgartira yoki o'chira olmaydi — ` +
          `nafaqaga chiqarishni keyingi reja hal qiladi.`,
      );
    }
  }

  /**
   * Xaritada yo'q shu darajadagi bo'limlarni nafaqaga chiqaradi.
   *
   * O'chirmaydi: eski DiB bo'limlarining lug'ati, tarjimasi va audiosi
   * yangi kurs uchun zaxira. Tartib raqami manfiyga o'tkaziladi, chunki
   * `@@unique([level, order])` ni yangi unitlar egallaydi.
   */
  private async retireOld(
    level: KursFile['level'],
    liveCodes: Set<string>,
  ): Promise<number> {
    const old = await this.prisma.dafUnit.findMany({
      where: { level, retiredAt: null },
      select: { id: true, code: true },
    });

    let n = 0;
    for (const u of old) {
      if (u.code !== null && liveCodes.has(u.code)) continue;
      await this.prisma.dafUnit.update({
        where: { id: u.id },
        data: { retiredAt: new Date(), order: -u.id },
      });
      n += 1;
    }
    return n;
  }
}
