import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { HolidaysService } from '../../holidays/holidays.service';
import {
  dayOfWeekForDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { isTashkentSunday } from '../../telegram-groups/utils/format.util';
import { describeError } from '../../telegram-digest/telegram-send';
import { haftaTayyormi } from './eslatma-auditoriya';
import { eskilariniTozala } from './eslatma-jurnali';
import { EslatmaYuborish, type YuborishNatija } from './eslatma-yuborish';
import {
  eslatmaRejimi,
  haftalikQaror,
  toshkentSoati,
  type EslatmaRejimi,
} from './eslatma-qoidalari';

/**
 * S4 cronlari (spec S4 §1, §2, §5; ADR-0117). `DAF_ESLATMALAR` har yurishda
 * o'qiladi: `off` (standart) — hech narsa; `log` — auditoriya sanaladi va
 * logga yoziladi; `on` — yuboriladi. Har kompaniya alohida: birining xatosi
 * logga yoziladi, qolganlari davom etadi. `CRONS_ENABLED=false` da
 * `ScheduleModule` yuklanmaydi — alohida tekshiruv shart emas.
 */
@Injectable()
export class EslatmaCron {
  private readonly logger = new Logger(EslatmaCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
    private readonly yuborish: EslatmaYuborish,
  ) {}

  /** Dushanba–shanba 19:30; yakshanba va umumiy bayram kunida yo'q (spec §1.1). */
  @Cron('0 30 19 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async kechkiTick(): Promise<void> {
    try {
      await this.kechki(new Date());
    } catch (err) {
      this.logger.error(`Kechki eslatma yiqildi: ${describeError(err)}`);
    }
  }

  /**
   * Dushanba 09:00, hafta hali hisoblanmagan bo'lsa 10:00 … 18:00 har soatda
   * (spec §2). Bayram dushanbasida ham — xulosa qo'ng'iroq emas. Yuborilgan
   * o'quvchi keyingi soatlarda auditoriyaga kirmaydi (shu dushanba qatori bor).
   * `log` rejimida jurnal yozilmaydi, shuning uchun tayyor hafta har soatda
   * bir auditoriya qatorini qayta logga yozadi (kutilgan, zararsiz).
   */
  @Cron('0 0 9-18 * * 1', { timeZone: 'Asia/Tashkent' })
  async haftalikTick(): Promise<void> {
    try {
      await this.haftalik(new Date());
    } catch (err) {
      this.logger.error(`Dushanba xulosasi yiqildi: ${describeError(err)}`);
    }
  }

  async kechki(now: Date): Promise<number> {
    const rejim = eslatmaRejimi(process.env.DAF_ESLATMALAR);
    if (rejim === 'off' || isTashkentSunday(now)) return 0;
    const bugun = tashkentDateStr(now);
    const bayram = await this.holidays.findActiveHolidayCovering(
      utcMidnightFromDateStr(bugun),
      null,
    );
    if (bayram) return 0;
    let ok = 0;
    for (const c of await this.kompaniyalar()) {
      try {
        const n = await this.yuborish.kechki(c.id, bugun, rejim);
        this.hisobot('kechki', rejim, c.id, n);
        if (rejim === 'on') await eskilariniTozala(this.prisma, c.id, bugun);
        ok += 1;
      } catch (err) {
        this.logger.error(
          `Kechki eslatma yiqildi (kompaniya ${c.id}): ${describeError(err)}`,
        );
      }
    }
    return ok;
  }

  async haftalik(now: Date): Promise<number> {
    const rejim = eslatmaRejimi(process.env.DAF_ESLATMALAR);
    if (rejim === 'off') return 0;
    const bugun = tashkentDateStr(now);
    if (dayOfWeekForDateStr(bugun) !== 1) return 0;
    const soat = toshkentSoati(now);
    let ok = 0;
    for (const c of await this.kompaniyalar()) {
      try {
        const qaror = haftalikQaror(
          soat,
          await haftaTayyormi(this.prisma, c.id, bugun),
        );
        if (qaror === 'kut') {
          this.logger.warn(
            `Dushanba xulosasi: kompaniya ${c.id}, o'tgan hafta hali hisoblanmagan — ${soat + 1}:00 da qayta urinadi`,
          );
          continue;
        }
        if (qaror === 'tashla') {
          this.logger.warn(
            `Dushanba xulosasi: kompaniya ${c.id}, o'tgan hafta 18:00 gacha hisoblanmadi — shu hafta yuborilmaydi`,
          );
          continue;
        }
        const n = await this.yuborish.haftalik(c.id, bugun, rejim);
        this.hisobot('haftalik', rejim, c.id, n);
        ok += 1;
      } catch (err) {
        this.logger.error(
          `Dushanba xulosasi yiqildi (kompaniya ${c.id}): ${describeError(err)}`,
        );
      }
    }
    return ok;
  }

  private kompaniyalar(): Promise<{ id: number }[]> {
    return this.prisma.company.findMany({ select: { id: true } });
  }

  private hisobot(
    tur: 'kechki' | 'haftalik',
    rejim: EslatmaRejimi,
    companyId: number,
    n: YuborishNatija,
  ): void {
    this.logger.log(
      rejim === 'log'
        ? `Eslatma (log): kompaniya ${companyId}, ${tur} auditoriya ${n.auditoriya} — yuborilmadi`
        : `Eslatma: kompaniya ${companyId}, ${tur}: ${n.auditoriya} auditoriya, ${n.yuborildi} yuborildi, ${n.xato} xato, ${n.otkazildi} o'tkazildi`,
    );
  }
}
