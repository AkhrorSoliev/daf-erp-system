import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { settleDue } from './liga-hisob';

/**
 * Dushanba 00:05 Toshkent — o'tgan hafta hisobi (spec S3 §1.4, ADR-0116).
 * Har kompaniya alohida: birining xatosi logga yoziladi, qolganlari davom
 * etadi. O'tkazib yuborilgan hafta birinchi seans oxirida o'zi hisoblanadi.
 * `CRONS_ENABLED=false` da `ScheduleModule` yuklanmaydi — alohida tekshiruv
 * shart emas.
 */
@Injectable()
export class LigaCron {
  private readonly logger = new Logger(LigaCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 5 0 * * 1', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    await this.run(new Date());
  }

  async run(jetzt: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    let ok = 0;
    for (const c of companies) {
      try {
        for (const n of await settleDue(this.prisma, c.id, jetzt, {
          kutish: true,
        })) {
          this.logger.log(
            `Liga hisobi: kompaniya ${c.id}, hafta ${n.haftaBoshi}: ${n.xonalar} xona, ${n.azolar} a'zo, ${n.kotarildi} ko'tarildi, ${n.yangiXonalar} yangi xona, ${n.guruhlar} guruh`,
          );
        }
        ok += 1;
      } catch (err) {
        this.logger.error(
          `Liga hisobi yiqildi (kompaniya ${c.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return ok;
  }
}
