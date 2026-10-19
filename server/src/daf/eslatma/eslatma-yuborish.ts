import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../../sms/sms.service';
import { describeError } from '../../telegram-digest/telegram-send';
import { MAQSAD_BALL, maqsadDarajasi } from '../uebung/punkte';
import {
  haftalikAuditoriya,
  kechkiAuditoriya,
  type HaftalikQator,
} from './eslatma-auditoriya';
import { eslatmaniEgalla, natijaniYoz } from './eslatma-jurnali';
import {
  haftalikMatn,
  kechkiMatn,
  toxtatishTugmasi,
  type HaftalikMalumot,
} from './eslatma-matn';
import {
  PAUZA_MS,
  type EslatmaHolati,
  type EslatmaRejimi,
  type EslatmaTuri,
} from './eslatma-qoidalari';

export interface YuborishNatija {
  auditoriya: number;
  yuborildi: number;
  xato: number;
  /** Qatori boshqa chaqiruvda egallangan (cronning ikki nusxasi, qayta ishga tushirish). */
  otkazildi: number;
}

/** Auditoriya qatori → xulosa matnining kirishi: ma'lumoti yo'q qator chiqmaydi. */
export function haftalikMalumot(q: HaftalikQator): HaftalikMalumot {
  return {
    ism: q.ism,
    ball: q.ball,
    liga:
      q.tier !== null && q.orin !== null
        ? { tier: q.tier, orin: q.orin, kotarildi: q.kotarildi }
        : null,
    guruh:
      q.guruhOrin !== null ? { orin: q.guruhOrin, jami: q.guruhJami } : null,
    nishonlar: q.nishonlar,
  };
}

/**
 * S4 yuboruvchisi (spec S4 §5, ADR-0117): auditoriya → jurnalda egallash →
 * `SmsService.sendToStudent` (audit `SmsMessage` va «SMS» tabi; to'g'ridan-
 * to'g'ri Telegram chaqiruvi yo'q — ADR-0025 qorovuli o'zgarmaydi) → natija.
 * Ketma-ket; egallangan har o'quvchidan keyin (xato bo'lsa ham) `pauzaMs`.
 * Bitta o'quvchidagi xato logga yoziladi va qolganlarini to'xtatmaydi. `off` — hech narsa (bazaga ham
 * tegmaydi); `log` — faqat auditoriya sanaladi va logga yoziladi, jurnalga
 * yozilmaydi; `on` — yuboradi.
 */
@Injectable()
export class EslatmaYuborish {
  private readonly logger = new Logger(EslatmaYuborish.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async kechki(
    companyId: number,
    bugun: string,
    rejim: EslatmaRejimi,
    pauzaMs: number = PAUZA_MS,
  ): Promise<YuborishNatija> {
    if (rejim === 'off') return this.faqatSon(0);
    const qatorlar = await kechkiAuditoriya(this.prisma, companyId, bugun);
    if (rejim !== 'on')
      return this.sinov('EVENING', companyId, qatorlar.length);
    return this.yubor(companyId, 'EVENING', bugun, qatorlar, pauzaMs, (q) =>
      kechkiMatn({
        ism: q.ism,
        seriya: q.seriya,
        maqsadBall: MAQSAD_BALL[maqsadDarajasi(q.dailyGoal)],
      }),
    );
  }

  async haftalik(
    companyId: number,
    bugun: string,
    rejim: EslatmaRejimi,
    pauzaMs: number = PAUZA_MS,
  ): Promise<YuborishNatija> {
    if (rejim === 'off') return this.faqatSon(0);
    const qatorlar = await haftalikAuditoriya(this.prisma, companyId, bugun);
    if (rejim !== 'on') return this.sinov('WEEKLY', companyId, qatorlar.length);
    return this.yubor(companyId, 'WEEKLY', bugun, qatorlar, pauzaMs, (q) =>
      haftalikMatn(haftalikMalumot(q)),
    );
  }

  /** Sinovda almashtiriladi. */
  protected pauza(ms: number): Promise<void> {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  private faqatSon(auditoriya: number): YuborishNatija {
    return { auditoriya, yuborildi: 0, xato: 0, otkazildi: 0 };
  }

  private sinov(
    kind: EslatmaTuri,
    companyId: number,
    auditoriya: number,
  ): YuborishNatija {
    this.logger.log(
      `Eslatma (${kind}) log rejimi: kompaniya ${companyId}, auditoriya ${auditoriya}, hech narsa yuborilmadi`,
    );
    return this.faqatSon(auditoriya);
  }

  private async yubor<T extends { studentId: number }>(
    companyId: number,
    kind: EslatmaTuri,
    sentOn: string,
    qatorlar: T[],
    pauzaMs: number,
    matn: (q: T) => string,
  ): Promise<YuborishNatija> {
    const n = this.faqatSon(qatorlar.length);
    for (const q of qatorlar) {
      let egallandi = false;
      try {
        const id = await eslatmaniEgalla(this.prisma, {
          companyId,
          studentId: q.studentId,
          kind,
          sentOn,
        });
        if (id === null) {
          n.otkazildi += 1;
          continue;
        }
        egallandi = true;
        // Qator FAILED bilan egallangan; SENT faqat muvaffaqiyatli
        // yuborishdan keyin yoziladi (429 ham shu yerda FAILED qoladi —
        // o'sha kuni qayta urinilmaydi).
        let holat: EslatmaHolati = 'FAILED';
        try {
          const sms = await this.sms.sendToStudent(
            q.studentId,
            matn(q),
            'AUTO',
            undefined,
            companyId,
            { replyMarkup: toxtatishTugmasi(q.studentId) },
          );
          if (sms.status === 'SENT') holat = 'SENT';
        } finally {
          // Jurnal xatosi asl xatoni almashtirmasin va sikl to'xtamasin.
          try {
            await natijaniYoz(this.prisma, id, holat);
          } catch (e) {
            this.logger.warn(
              `Eslatma (${kind}) o'quvchi ${q.studentId}: natijani yozib bo'lmadi: ${describeError(e)}`,
            );
          }
        }
        if (holat === 'SENT') n.yuborildi += 1;
        else n.xato += 1;
      } catch (err) {
        n.xato += 1;
        this.logger.warn(
          `Eslatma (${kind}) o'quvchi ${q.studentId}: ${describeError(err)}`,
        );
      } finally {
        // Pauza xato yo'lida ham: aks holda bazaga yozish xatosida butun
        // auditoriya botning tezlik chegarasidan tez ketadi.
        if (egallandi && pauzaMs > 0) await this.pauza(pauzaMs);
      }
    }
    return n;
  }
}
