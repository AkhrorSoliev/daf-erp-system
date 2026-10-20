import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { wochenStartTag } from '../uebung/punkte';
import { reytingIsmi } from '../shared/reyting-ismi';
import { guruhlarYigindisi } from '../liga/guruhlar-jadvali';
import {
  GURUH_MIN_AZO,
  bahoKorinishi,
  guruhlarniSarala,
} from '../liga/liga-qoidalari';
import {
  haftalarRoyxati,
  haftaniTanla,
  oquvchiQatorlari,
} from './musobaqa-ustoz-qoidalari';
import { azolarBallari, azolarKunlari } from './musobaqa-ustoz.sql';
import type {
  AzoMalumoti,
  MusobaqaGuruh,
  MusobaqaJavob,
  MusobaqaTarixQatori,
} from './musobaqa-ustoz.types';

/** `@db.Date` yarim tun (UTC) qiymatini `YYYY-MM-DD` ga — bu «hozir» emas, sana ustuni. */
const sanaMatni = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Guruh sahifasidagi «Musobaqa» tabi (spec S5). FAQAT O'QIYDI. Huquqni
 * kontroller (`assertCallerMayTouchGroup`) hal qiladi; bu yerda `companyId`
 * a'zolar so'rovida ham qo'llanadi.
 */
@Injectable()
export class MusobaqaUstozService {
  constructor(private readonly prisma: PrismaService) {}

  async guruhKorinishi(
    groupId: string,
    companyId: number,
    haftaParam: string | undefined,
    jetzt: Date,
  ): Promise<MusobaqaJavob> {
    const bugun = tashkentDateStr(jetzt);
    const joriyHafta = wochenStartTag(jetzt);
    const hafta = haftaniTanla(haftaParam, joriyHafta);
    if (hafta === null) {
      throw new BadRequestException(
        "Hafta noto'g'ri: joriy hafta yoki oldingi 8 hafta dushanbasi tanlanadi",
      );
    }
    const joriy = hafta === joriyHafta;
    const haftalar = haftalarRoyxati(joriyHafta);

    const azolar = await this.azolar(groupId, companyId);
    const ids = azolar.map((a) => a.studentId);
    const [ballar, kunlar, guruh, tarix] = await Promise.all([
      ids.length
        ? azolarBallari(this.prisma, companyId, groupId, ids, hafta)
        : [],
      ids.length ? azolarKunlari(this.prisma, companyId, ids, bugun) : [],
      joriy
        ? this.joriyKarta(groupId, companyId, hafta)
        : this.otganKarta(groupId, companyId, hafta),
      this.tarix(groupId, companyId, haftalar.slice(1)),
    ]);
    return {
      bugun,
      haftaBoshi: hafta,
      joriy,
      haftalar,
      guruh,
      tarix,
      oquvchilar: oquvchiQatorlari({ azolar, ballar, kunlar, joriy, bugun }),
    };
  }

  /** S3 `guruhlarYigindisi` a'zolari bilan bir xil to'plam: ACTIVE yozilish, takrorsiz. */
  private async azolar(
    groupId: string,
    companyId: number,
  ): Promise<AzoMalumoti[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE', group: { companyId } },
      distinct: ['studentId'],
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { id: true } },
            dafLeague: { select: { tier: true } },
            dafSetting: { select: { dailyGoal: true } },
            _count: { select: { dafBadges: true } },
          },
        },
      },
    });
    return rows.map(({ student: s }) => ({
      studentId: s.id,
      ism: reytingIsmi(s),
      akkaunt: s.user !== null,
      tier: s.dafLeague?.tier ?? 0,
      dailyGoal: s.dafSetting?.dailyGoal ?? null,
      nishonlar: s._count.dafBadges,
    }));
  }

  /** Jonli: markaz bo'yicha hamma faol guruh (31 ms) — o'rin S3 jadvali bilan bir manbadan. */
  private async joriyKarta(
    groupId: string,
    companyId: number,
    hafta: string,
  ): Promise<MusobaqaGuruh> {
    const rows = await guruhlarYigindisi(this.prisma, companyId, hafta);
    const oz = rows.find((r) => r.groupId === groupId);
    if (!oz) {
      return {
        holat: 'FAOL_EMAS',
        orin: null,
        guruhSoni: null,
        baho: null,
        azolar: 0,
        ball: 0,
        minAzolar: GURUH_MIN_AZO,
      };
    }
    const jadval = guruhlarniSarala(rows);
    const orin = jadval.find((g) => g.groupId === groupId)?.place ?? null;
    return {
      holat: orin === null ? 'KAM_AZO' : 'JADVALDA',
      orin,
      guruhSoni: jadval.length,
      baho: oz.azolar > 0 ? bahoKorinishi(oz.ball / oz.azolar) : null,
      azolar: oz.azolar,
      ball: oz.ball,
      minAzolar: GURUH_MIN_AZO,
    };
  }

  private async otganKarta(
    groupId: string,
    companyId: number,
    hafta: string,
  ): Promise<MusobaqaGuruh> {
    const weekStart = utcMidnightFromDateStr(hafta);
    const [qator, soni] = await Promise.all([
      this.prisma.dafGroupWeek.findFirst({
        where: { companyId, groupId, weekStart },
        select: { place: true, average: true, members: true, points: true },
      }),
      this.prisma.dafGroupWeek.count({ where: { companyId, weekStart } }),
    ]);
    if (!qator) {
      return {
        holat: 'YOZUV_YOQ',
        orin: null,
        guruhSoni: null,
        baho: null,
        azolar: 0,
        ball: 0,
        minAzolar: GURUH_MIN_AZO,
      };
    }
    return {
      holat: 'JADVALDA',
      orin: qator.place,
      guruhSoni: soni,
      baho: bahoKorinishi(qator.average),
      azolar: qator.members,
      ball: qator.points,
      minAzolar: GURUH_MIN_AZO,
    };
  }

  private async tarix(
    groupId: string,
    companyId: number,
    haftalar: string[],
  ): Promise<MusobaqaTarixQatori[]> {
    const rows = await this.prisma.dafGroupWeek.findMany({
      where: {
        companyId,
        groupId,
        weekStart: { in: haftalar.map((h) => utcMidnightFromDateStr(h)) },
      },
      select: { weekStart: true, place: true, average: true },
    });
    const byWeek = new Map(rows.map((r) => [sanaMatni(r.weekStart), r]));
    return haftalar.map((h) => {
      const r = byWeek.get(h);
      return {
        haftaBoshi: h,
        orin: r?.place ?? null,
        baho: r ? bahoKorinishi(r.average) : null,
      };
    });
  }
}
