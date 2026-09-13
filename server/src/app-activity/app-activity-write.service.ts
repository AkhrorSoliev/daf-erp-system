import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  birlashtir,
  bolimlarniOqi,
  type SeansQiymatlari,
} from './heartbeat-merge';
import type { ActivityHeartbeatDto } from './dto/activity-heartbeat.dto';

export interface FaollikKonteksti {
  studentId: number;
  companyId: number;
}

/**
 * Ilova faollik seansini yozadi (dizayn 4.3).
 *
 * Yangi seans birinchi so'rovda yaratiladi (`firstSeenAt`, Toshkent `day`,
 * muhrlangan `branchId`). Keyingilari qatorni `FOR UPDATE` bilan qulflab
 * yangilaydi: bir vaqtda kelgan ikki so'rov eskirgan qiymatni o'qib, bir-birini
 * pastroq raqam bilan bosib ketmasin.
 */
@Injectable()
export class AppActivityWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(
    dto: ActivityHeartbeatDto,
    ctx: FaollikKonteksti,
    now: Date = new Date(),
  ): Promise<{ activeSeconds: number; radioSeconds: number }> {
    const kelgan: SeansQiymatlari = {
      activeSeconds: dto.activeSeconds,
      radioSeconds: dto.radioSeconds,
      sections: bolimlarniOqi(dto.sections),
    };

    const bor = await this.prisma.studentAppSession.findUnique({
      where: { id: dto.sessionId },
      select: { studentId: true },
    });
    if (!bor) {
      const yaratildi = await this.yarat(dto, ctx, kelgan, now);
      if (yaratildi) return yaratildi;
    }
    return this.yangila(dto, ctx, kelgan, now);
  }

  /** `null` — shu orada boshqa so'rov yaratib ulgurdi (P2002), yangilash yo'liga o'tiladi. */
  private async yarat(
    dto: ActivityHeartbeatDto,
    ctx: FaollikKonteksti,
    kelgan: SeansQiymatlari,
    now: Date,
  ): Promise<{ activeSeconds: number; radioSeconds: number } | null> {
    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const q = birlashtir(null, kelgan, now, now);
    try {
      await this.prisma.studentAppSession.create({
        data: {
          id: dto.sessionId,
          studentId: ctx.studentId,
          companyId: ctx.companyId,
          branchId,
          platform: dto.platform,
          appVersion: dto.appVersion ?? null,
          day: utcMidnightFromDateStr(tashkentDateStr(now)),
          firstSeenAt: now,
          lastSeenAt: now,
          activeSeconds: q.activeSeconds,
          radioSeconds: q.radioSeconds,
          sections: q.sections as Prisma.InputJsonObject,
        },
      });
      return { activeSeconds: q.activeSeconds, radioSeconds: q.radioSeconds };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return null;
      }
      throw err;
    }
  }

  private yangila(
    dto: ActivityHeartbeatDto,
    ctx: FaollikKonteksti,
    kelgan: SeansQiymatlari,
    now: Date,
  ): Promise<{ activeSeconds: number; radioSeconds: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StudentAppSession" WHERE "id" = ${dto.sessionId} FOR UPDATE`;
      const mavjud = await tx.studentAppSession.findUnique({
        where: { id: dto.sessionId },
        select: {
          studentId: true,
          day: true,
          firstSeenAt: true,
          activeSeconds: true,
          radioSeconds: true,
          sections: true,
          appVersion: true,
        },
      });
      if (!mavjud || mavjud.studentId !== ctx.studentId) {
        throw new ForbiddenException("Bu seans boshqa o'quvchiga tegishli");
      }
      // `day` @db.Date — Prisma uni UTC yarim tuni sifatida qaytaradi.
      if (mavjud.day.toISOString().slice(0, 10) !== tashkentDateStr(now)) {
        throw new ConflictException('Seans kuni tugagan — yangi seans oching');
      }
      const q = birlashtir(
        {
          activeSeconds: mavjud.activeSeconds,
          radioSeconds: mavjud.radioSeconds,
          sections: bolimlarniOqi(mavjud.sections),
        },
        kelgan,
        mavjud.firstSeenAt,
        now,
      );
      await tx.studentAppSession.update({
        where: { id: dto.sessionId },
        data: {
          lastSeenAt: now,
          appVersion: dto.appVersion ?? mavjud.appVersion,
          activeSeconds: q.activeSeconds,
          radioSeconds: q.radioSeconds,
          sections: q.sections as Prisma.InputJsonObject,
        },
      });
      return { activeSeconds: q.activeSeconds, radioSeconds: q.radioSeconds };
    });
  }
}
