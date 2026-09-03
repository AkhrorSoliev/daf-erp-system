import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { planLessons } from './kurs-lessons';
import type { KursFile } from './kurs.types';

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
    const liveCodes = new Set<string>();

    for (const u of file.units) {
      liveCodes.add(u.code);

      const unit = await this.prisma.dafUnit.upsert({
        where: { code: u.code },
        create: {
          code: u.code,
          level: 'A1',
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
          l.sectionCode === null ? null : (sectionIdByCode.get(l.sectionCode) ?? null);

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

    const retired = await this.retireOld(liveCodes);

    this.logger.log(
      `A1 xaritasi: ${file.units.length} unit, ${sections} bo'lim, ${lessons} seans, ${retired} nafaqa`,
    );

    return { units: file.units.length, sections, lessons, retired };
  }

  /**
   * Xaritada yo'q A1 bo'limlarini nafaqaga chiqaradi.
   *
   * O'chirmaydi: eski DiB bo'limlarining lug'ati, tarjimasi va audiosi
   * yangi kurs uchun zaxira. Tartib raqami manfiyga o'tkaziladi, chunki
   * `@@unique([level, order])` ni yangi 12 unit egallaydi.
   */
  private async retireOld(liveCodes: Set<string>): Promise<number> {
    const old = await this.prisma.dafUnit.findMany({
      where: { level: 'A1', retiredAt: null },
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
