import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applyDiscount } from '../billing/monthly-price';
import { whereUserMayAct } from '../common/auth/blocked-user';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { tashkentDateStr } from '../common/date/tashkent';
import { EntityHistoryService } from '../common/entity-history';
import { CONCURRENT_CHANGE_MESSAGE } from '../common/transaction-conflict';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildCustomer,
  customerProblem,
  withExtras,
  type ContractFields,
} from './contract-fields';
import { assertCourseExtras, assertDay, extrasOf } from './contract-input';
import { loadContractView, type ContractView } from './contract-view';
import type { UpdateContractDocumentDto } from './dto/contract-document.dto';
import { renderContractPdf } from './pdf/contract-pdf';

/**
 * A contract after it is made (ADR-0075): editable until signed, signed on
 * paper once, cancelled with a reason, printed from its sealed fields.
 */
@Injectable()
export class ContractLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
  ) {}

  async update(
    id: string,
    dto: UpdateContractDocumentDto,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const doc = await this.loadOwned(id, companyId, userId);
    if (doc.cancelledAt) {
      throw new BadRequestException("Bekor qilingan shartnoma o'zgarmaydi");
    }
    if (doc.signedAt) {
      throw new BadRequestException("Imzolangan shartnoma o'zgarmaydi");
    }
    const fields = doc.fields as unknown as ContractFields;
    const changed: string[] = [];
    let next = fields;

    if (dto.customer) {
      assertDay(dto.customer.birthDate);
      const problem = customerProblem(
        dto.customer.kind,
        dto.customer.kindOther,
        fields.student.isMinor,
      );
      if (problem) throw new BadRequestException(problem);
      const customer = buildCustomer(dto.customer, fields.student);
      if (JSON.stringify(customer) !== JSON.stringify(fields.customer)) {
        next = { ...next, customer };
        changed.push('Buyurtmachi');
      }
    }

    if (dto.courses) {
      assertCourseExtras(dto.courses);
      const byId = new Map(dto.courses.map((c) => [c.enrollmentId, c]));
      if (
        [...byId.keys()].some(
          (key) => !fields.courses.some((c) => c.enrollmentId === key),
        )
      ) {
        throw new BadRequestException("Bu shartnomada bunday kurs yo'q");
      }
      next = {
        ...next,
        courses: next.courses.map((course) => {
          const input = byId.get(course.enrollmentId);
          if (!input) return course;
          const updated = {
            ...course,
            ...withExtras(
              extrasOf(input),
              applyDiscount(course.monthlyPrice, course.discountPercent),
            ),
          };
          if (JSON.stringify(updated) !== JSON.stringify(course)) {
            changed.push(`Kurs: ${course.courseName}`);
          }
          return updated;
        }),
      };
    }

    if (changed.length === 0) return loadContractView(this.prisma, id);

    return this.prisma.$transaction(async (tx) => {
      const res = await tx.contractDocument.updateMany({
        where: { id, signedAt: null, cancelledAt: null },
        data: { fields: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count !== 1) {
        throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
      }
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: doc.studentId,
        newValues: {
          action: 'SHARTNOMA_TAHRIRLANDI',
          raqam: doc.number,
          ozgardi: changed.join(', '),
        },
        changedById: userId,
        companyId,
        tx,
      });
      return loadContractView(tx, id);
    });
  }

  async sign(
    id: string,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const doc = await this.loadOwned(id, companyId, userId);
    if (doc.cancelledAt) {
      throw new BadRequestException('Bekor qilingan shartnoma imzolanmaydi');
    }
    if (doc.signedAt) {
      throw new BadRequestException('Shartnoma allaqachon imzolangan');
    }
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.contractDocument.updateMany({
        where: { id, signedAt: null, cancelledAt: null },
        data: { signedAt: new Date(), signedById: userId, signMethod: 'PAPER' },
      });
      if (res.count !== 1) {
        throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
      }
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: doc.studentId,
        newValues: {
          action: 'SHARTNOMA_IMZOLANDI',
          raqam: doc.number,
          usul: "qog'ozda",
        },
        changedById: userId,
        companyId,
        tx,
      });
      return loadContractView(tx, id);
    });
  }

  /**
   * An unsigned contract: anyone who may open the student. A signed one: the
   * CEO only, read from the database (ADR-0028). The courses become
   * contract-less, so a new contract can be made for them.
   */
  async cancel(
    id: string,
    reason: string,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const doc = await this.loadOwned(id, companyId, userId);
    if (doc.cancelledAt) {
      throw new BadRequestException('Shartnoma allaqachon bekor qilingan');
    }
    if (doc.signedAt && !(await this.isCeo(userId))) {
      throw new ForbiddenException(
        'Imzolangan shartnomani faqat CEO bekor qila oladi',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.contractDocument.updateMany({
        // An unsigned read must still be unsigned at the write, or a
        // non-CEO would cancel a contract signed in between.
        where: doc.signedAt
          ? { id, cancelledAt: null }
          : { id, cancelledAt: null, signedAt: null },
        data: {
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: reason,
        },
      });
      if (res.count !== 1) {
        throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
      }
      await tx.enrollment.updateMany({
        where: { contractDocumentId: id },
        data: { contractDocumentId: null },
      });
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: doc.studentId,
        newValues: {
          action: 'SHARTNOMA_BEKOR_QILINDI',
          raqam: doc.number,
          sabab: reason,
        },
        changedById: userId,
        companyId,
        tx,
      });
      return loadContractView(tx, id);
    });
  }

  async pdf(
    id: string,
    companyId: number,
    userId: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.loadOwned(id, companyId, userId);
    const buffer = await renderContractPdf({
      number: doc.number,
      contractDate: tashkentDateStr(doc.contractDate),
      cancelled: doc.cancelledAt !== null,
      templateVersion: doc.templateVersion,
      fields: doc.fields as unknown as ContractFields,
    });
    return { buffer, filename: `Shartnoma-${doc.number}.pdf` };
  }

  private async loadOwned(id: string, companyId: number, userId: number) {
    const doc = await this.prisma.contractDocument.findFirst({
      where: { id, companyId },
    });
    if (!doc) throw new NotFoundException('Shartnoma topilmadi');
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      doc.studentId,
      companyId,
    );
    return doc;
  }

  private async isCeo(userId: number): Promise<boolean> {
    const caller = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...whereUserMayAct(),
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true },
    });
    return caller !== null;
  }
}
