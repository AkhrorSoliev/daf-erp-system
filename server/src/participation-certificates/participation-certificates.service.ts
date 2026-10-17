import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { whereUserMayAct } from '../common/auth/blocked-user';
import { ROLE_ID } from '../common/auth/role-ids';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { tashkentDateStr } from '../common/date/tashkent';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { publicBaseUrl } from '../receipts/receipt-urls';
import { renderCertificatePdf } from './participation-certificate-pdf';
import { ParticipationFactsService } from './participation-facts.service';
import { certificateNumber } from './participation-number';
import { evaluate, normalizeLevel } from './participation-rules';
import { ParticipationSettingsService } from './participation-settings.service';
import { buildSnapshot } from './participation-snapshot';
import type {
  CertificatePreview,
  CertificateSnapshot,
  IssuedView,
  VerifyView,
} from './participation-types';

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

interface IssuedRow {
  id: string;
  number: string;
  level: string;
  issuedAt: Date;
  exemptReason: string | null;
  revokedAt: Date | null;
}

const toIssuedView = (r: IssuedRow): IssuedView => ({
  id: r.id,
  number: r.number,
  level: r.level,
  issuedAt: r.issuedAt.toISOString(),
  exempt: r.exemptReason !== null,
  revoked: r.revokedAt !== null,
});

/**
 * «Teilnahmebestätigung» (spec 2026-10-17): preview what a student qualifies
 * for, issue a sealed document, serve its PDF and its public QR answer.
 * Counting and thresholds live in `participation-rules.ts`; this service only
 * loads, decides through it, and writes.
 */
@Injectable()
export class ParticipationCertificatesService {
  constructor(
    private prisma: PrismaService,
    private facts: ParticipationFactsService,
    private settings: ParticipationSettingsService,
    private history: EntityHistoryService,
    private config: ConfigService,
  ) {}

  async preview(
    userId: number,
    companyId: number,
    studentId: number,
  ): Promise<CertificatePreview> {
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const [data, settings, issued] = await Promise.all([
      this.facts.load(studentId, companyId),
      this.settings.read(companyId),
      this.prisma.participationCertificate.findMany({
        where: { studentId, companyId },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          level: true,
          number: true,
          issuedAt: true,
          exemptReason: true,
          revokedAt: true,
        },
      }),
    ]);
    return {
      studentId,
      unleveledGroups: data.unleveledGroups,
      levels: data.levels.map((facts) => {
        const thresholds = this.settings.thresholdsFor(settings, facts.level);
        return {
          ...facts,
          thresholds,
          verdict: evaluate(facts.attendance, facts.app, thresholds),
          issued: issued
            .filter((i) => i.level === facts.level)
            .map(toIssuedView),
        };
      }),
    };
  }

  async issue(
    userId: number,
    companyId: number,
    studentId: number,
    dto: { level: string; exemptReason?: string },
  ): Promise<IssuedView> {
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const level = normalizeLevel(dto.level);
    if (!level) throw new BadRequestException("Daraja noto'g'ri");

    const data = await this.facts.load(studentId, companyId, level);
    const facts = data.levels[0];
    if (!facts) {
      throw new NotFoundException("Bu daraja bo'yicha davomat topilmadi");
    }
    const thresholds = this.settings.thresholdsFor(
      await this.settings.read(companyId),
      level,
    );
    const verdict = evaluate(facts.attendance, facts.app, thresholds);

    const reason = dto.exemptReason?.trim() || null;
    const exempt = !verdict.eligible;
    if (exempt) {
      if (!reason) {
        throw new BadRequestException(
          `Hujjat berib bo'lmaydi: ${verdict.reasons.join('; ')}`,
        );
      }
      await this.assertCeo(userId);
    }

    const snapshot = buildSnapshot(data.student, facts, thresholds, exempt);
    const issuedAt = new Date();
    const year = Number(tashkentDateStr(issuedAt).slice(0, 4));

    const row = await this.prisma
      .$transaction(async (tx) => {
        const last = await tx.participationCertificate.findFirst({
          where: { companyId, year },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        });
        const seq = (last?.seq ?? 0) + 1;
        return tx.participationCertificate.create({
          data: {
            companyId,
            branchId,
            studentId,
            level,
            year,
            seq,
            number: certificateNumber(year, seq),
            issuedAt,
            issuedById: userId,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            exemptReason: exempt ? reason : null,
            exemptById: exempt ? userId : null,
          },
        });
      }, TX_OPTIONS)
      // The unique (company, year, seq) can only collide with a concurrent issue.
      .catch((e: unknown) => rethrowAsConflict(e, { duplicate: true }));

    await this.history.recordCreate({
      entityType: 'Student',
      entityId: studentId,
      newValues: {
        action: 'QATNASHISH_HUJJATI_BERILDI',
        raqam: row.number,
        daraja: level,
        istisno: exempt ? reason : null,
      },
      changedById: userId,
      companyId,
    });
    return toIssuedView(row);
  }

  async pdf(
    userId: number,
    companyId: number,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.prisma.participationCertificate.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        studentId: true,
        number: true,
        issuedAt: true,
        snapshot: true,
      },
    });
    if (!row) throw new NotFoundException('Hujjat topilmadi');
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      row.studentId,
      companyId,
    );
    const buffer = await renderCertificatePdf({
      snapshot: row.snapshot as unknown as CertificateSnapshot,
      number: row.number,
      issuedAt: row.issuedAt,
      url: `${publicBaseUrl(this.config)}/t/${row.id}`,
    });
    return { buffer, filename: `${row.number}.pdf` };
  }

  /** The public QR answer: no branch, no birth date, no percentages. */
  async verify(id: string): Promise<VerifyView> {
    const row = await this.prisma.participationCertificate.findFirst({
      where: { id },
      select: {
        number: true,
        level: true,
        issuedAt: true,
        companyId: true,
        revokedAt: true,
        snapshot: true,
      },
    });
    if (!row) throw new NotFoundException('Hujjat topilmadi');
    const company = await this.prisma.company.findFirst({
      where: { id: row.companyId },
      select: { name: true },
    });
    const snapshot = row.snapshot as unknown as CertificateSnapshot;
    return {
      valid: row.revokedAt === null,
      revoked: row.revokedAt !== null,
      number: row.number,
      studentName: `${snapshot.student.firstName} ${snapshot.student.lastName}`,
      level: row.level,
      from: snapshot.from,
      to: snapshot.to,
      issuedAt: row.issuedAt.toISOString(),
      companyName: company?.name ?? 'DaF Sprachzentrum',
    };
  }

  /** The CEO role is read from the database, never from the token (ADR-0028). */
  private async assertCeo(userId: number): Promise<void> {
    const ceo = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...whereUserMayAct(),
        roles: { some: { role: { id: ROLE_ID.CEO } } },
      },
      select: { id: true },
    });
    if (!ceo) throw new ForbiddenException('Istisnoni faqat CEO bera oladi');
  }
}
