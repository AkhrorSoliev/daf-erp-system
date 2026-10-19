import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NishonSharoiti } from '../nishon/nishon-katalogi';
import { settleDue } from './liga-hisob';
import { joinRoom, ligaSharoiti, type LigaSharoiti } from './liga-xona';

const logger = new Logger('LigaSeans');

/** Nishon sharti uchun liga qismi (`NishonSharoiti`). */
export type LigaNishonSharoiti = Required<
  Pick<NishonSharoiti, 'liga' | 'xonaGolib' | 'guruhBirinchi'>
>;

/**
 * Seans oxiri (spec S3 §1.5): liga holati — bitta so'rov; o'tgan hafta
 * hisoblanmagan bo'lsa hisob (kutmaydi: boshqa so'rov hisoblayotgan bo'lsa
 * `joinRoom` uning tugashini shared qulfda kutadi), so'ng holat qayta
 * o'qiladi; shu hafta xonada bo'lmasa qo'shiladi. Hisob FAQAT `kechikkan`
 * bo'lganda: `settleDue` har doim oxirgi haftani ham hisoblaydi, ya'ni
 * ajratilgan kompaniya qulfi va guruhlar jadvalini qayta qurish — har seans
 * oxirida bunga yo'l qo'yib bo'lmaydi. Bu bezak: seans saqlangan, shuning
 * uchun hech qachon otmaydi — holat o'qilmasa `null` (liga nishonlari bu
 * seansda berilmaydi), hisob/qo'shilish yiqilsa o'quvchi keyingi seansda
 * qo'shiladi.
 */
export async function liganiYangilaXavfsiz(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<LigaNishonSharoiti | null> {
  let holat: LigaSharoiti;
  try {
    holat = await ligaSharoiti(prisma, studentId, companyId, jetzt);
  } catch (err) {
    logger.warn(
      `Liga holati o'qilmadi (studentId=${studentId}): ${(err as Error).message}`,
    );
    return null;
  }
  try {
    if (holat.kechikkan) {
      await settleDue(prisma, companyId, jetzt, { kutish: false });
      holat = await ligaSharoiti(prisma, studentId, companyId, jetzt);
    }
    if (!holat.azo) await joinRoom(prisma, studentId, companyId, jetzt);
  } catch (err) {
    logger.warn(
      `Liga yangilanmadi (studentId=${studentId}): ${(err as Error).message}`,
    );
  }
  return {
    liga: holat.tier,
    xonaGolib: holat.xonaGolib,
    guruhBirinchi: holat.guruhBirinchi,
  };
}
