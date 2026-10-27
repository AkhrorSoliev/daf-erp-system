import { PrismaService } from '../../prisma/prisma.service';
import { tashkentDateStr } from '../../common/date/tashkent';
import { serieAus } from '../uebung/punkte';
import { ligaSharoiti } from '../liga/liga-xona';
import { woerterSoni } from './nishon-berish';
import { NISHON_KATALOGI, qoldi, type NishonTuri } from './nishon-katalogi';

export interface NishonQatori {
  key: string;
  tur: NishonTuri;
  chegara: number;
  /** Olingan vaqt (ISO) yoki `null`. */
  olingan: string | null;
  /** Olinmagan nishon uchun «yana N kun / N ta so'z»; olinganda `null`. */
  qoldi: number | null;
}

/**
 * `GET .../nishonlar` (spec S2 2.3) — tab ochilgandagina so'raladi. Hech
 * narsa YOZMAYDI: nishon faqat seans oxirida beriladi; sharti bajarilgan,
 * lekin hali berilmagan nishon `qoldi: 0` bilan ko'rinadi va keyingi seansda
 * beriladi. Joriy seriya va so'z soni shu yerda hisoblanadi.
 */
export async function nishonlarRoyxati(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<NishonQatori[]> {
  const [kunlar, woerter, olinganlar, liga, jangGolib] = await Promise.all([
    prisma.dafStudentDay.findMany({
      where: { studentId, attempts: { gt: 0 } },
      select: { day: true },
      distinct: ['day'],
    }),
    woerterSoni(prisma, studentId),
    prisma.dafStudentBadge.findMany({
      where: { studentId },
      select: { key: true, earnedAt: true },
    }),
    ligaSharoiti(prisma, studentId, companyId, jetzt),
    prisma.dafBattle.count({ where: { studentId, result: 'WIN' } }),
  ]);
  // `@db.Date` qiymati — o'sha kalendar kunining UTC yarim tuni.
  const serie = serieAus(
    kunlar.map((k) => k.day.toISOString().slice(0, 10)),
    tashkentDateStr(jetzt),
  );
  const sharoit = {
    serie,
    woerter,
    liga: liga.tier,
    xonaGolib: liga.xonaGolib,
    guruhBirinchi: liga.guruhBirinchi,
    jangGolib,
  };
  const olingan = new Map(olinganlar.map((b) => [b.key, b.earnedAt]));
  return NISHON_KATALOGI.map((n) => {
    const at = olingan.get(n.key);
    return {
      key: n.key,
      tur: n.tur,
      chegara: n.chegara,
      olingan: at ? at.toISOString() : null,
      qoldi: at ? null : qoldi(n, sharoit),
    };
  });
}
