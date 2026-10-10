import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applyDiscount, clampDiscount } from '../billing/monthly-price';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { EntityHistoryService } from '../common/entity-history';
import {
  CONCURRENT_CHANGE_MESSAGE,
  rethrowAsConflict,
} from '../common/transaction-conflict';
import { PrismaService } from '../prisma/prisma.service';
import { birthDateProblem } from '../students/shared/student-onboarding';
import {
  CONTRACT_TEMPLATE_VERSION,
  buildCourseFields,
  buildCustomer,
  courseList,
  customerProblem,
  isMinorOn,
  missingBranchFields,
  personName,
  storedBirthDay,
  type ContractFields,
} from './contract-fields';
import { assertCourseExtras, assertDay, extrasOf } from './contract-input';
import { nextContractNumber } from './contract-number';
import {
  CONTRACT_VIEW_INCLUDE,
  loadContractView,
  toContractView,
  type ContractPrefill,
  type ContractView,
  type ContractsList,
} from './contract-view';
import type { CreateContractDocumentDto } from './dto/contract-document.dto';

const LIVE_STATUSES = ['ACTIVE', 'FROZEN'] as const;

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

const STUDENT_FOR_CONTRACT = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  deletedAt: true,
  discountPercent: true,
  phone: true,
  telegram: true,
  passportSeries: true,
  address: true,
  parentName: true,
  parentPhone: true,
} as const satisfies Prisma.StudentSelect;

const BRANCH_FOR_CONTRACT = {
  name: true,
  city: true,
  address: true,
  representativeName: true,
  representativePosition: true,
} as const satisfies Prisma.BranchSelect;

const ENROLLMENT_FOR_CONTRACT = {
  id: true,
  status: true,
  startDate: true,
  createdAt: true,
  contractDocument: { select: { number: true } },
  group: {
    select: {
      name: true,
      level: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
      lessonMinutes: true,
      course: {
        select: {
          name: true,
          price: true,
          lessonMinutes: true,
          paymentModel: true,
        },
      },
      teachers: {
        select: { teacher: { select: { firstName: true, lastName: true } } },
      },
    },
  },
} as const satisfies Prisma.EnrollmentSelect;

/** A course still without a contract: live monthly enrollment, no live link. */
export function uncoveredWhere(studentId: number): Prisma.EnrollmentWhereInput {
  return {
    studentId,
    deletedAt: null,
    status: { in: [...LIVE_STATUSES] },
    contractDocumentId: null,
    group: { course: { paymentModel: 'MONTHLY' } },
  };
}

/**
 * Reading a student's contracts and making a new one (ADR-0075). What
 * happens to a contract afterwards — edit, signing, cancelling, printing —
 * is `ContractLifecycleService`.
 */
@Injectable()
export class ContractDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
  ) {}

  async list(
    studentId: number,
    companyId: number,
    userId: number,
  ): Promise<ContractsList> {
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const [docs, uncovered] = await Promise.all([
      this.prisma.contractDocument.findMany({
        where: { studentId, companyId },
        orderBy: { createdAt: 'desc' },
        include: CONTRACT_VIEW_INCLUDE,
      }),
      this.prisma.enrollment.findMany({
        where: uncoveredWhere(studentId),
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          group: { select: { name: true, course: { select: { name: true } } } },
        },
      }),
    ]);
    return {
      contracts: docs.map(toContractView),
      uncovered: uncovered.map((e) => ({
        enrollmentId: e.id,
        status: e.status,
        courseName: e.group.course.name,
        groupName: e.group.name,
      })),
    };
  }

  async prefill(
    studentId: number,
    companyId: number,
    userId: number,
  ): Promise<ContractPrefill> {
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const [student, branch, last, enrollments] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: studentId, companyId },
        select: STUDENT_FOR_CONTRACT,
      }),
      this.prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: BRANCH_FOR_CONTRACT,
      }),
      this.prisma.contractDocument.findFirst({
        where: { studentId, companyId },
        orderBy: { createdAt: 'desc' },
        select: { fields: true },
      }),
      this.prisma.enrollment.findMany({
        where: {
          studentId,
          deletedAt: null,
          status: { in: [...LIVE_STATUSES] },
          group: { course: { paymentModel: 'MONTHLY' } },
        },
        orderBy: { createdAt: 'asc' },
        select: ENROLLMENT_FOR_CONTRACT,
      }),
    ]);
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    if (!branch) throw new NotFoundException('Filial topilmadi');

    const today = tashkentDateStr(new Date());
    const birthDate = student.dateOfBirth
      ? storedBirthDay(student.dateOfBirth)
      : null;
    const discount = clampDiscount(student.discountPercent);
    return {
      today,
      branch: { name: branch.name, missing: missingBranchFields(branch) },
      student: {
        fullName: personName(student),
        birthDate,
        isMinor: birthDate ? isMinorOn(birthDate, today) : null,
        phone: student.phone,
        telegram: student.telegram,
        passport: student.passportSeries,
        address: student.address,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
      },
      lastCustomer: last
        ? (last.fields as unknown as ContractFields).customer
        : null,
      courses: enrollments.map((e) => ({
        enrollmentId: e.id,
        status: e.status,
        courseName: e.group.course.name,
        groupName: e.group.name,
        contractNumber: e.contractDocument?.number ?? null,
        monthlyPrice: e.group.course.price,
        discountPercent: discount,
        firstPaymentAmount: applyDiscount(e.group.course.price, discount),
      })),
    };
  }

  async create(
    dto: CreateContractDocumentDto,
    companyId: number,
    userId: number,
  ): Promise<ContractView> {
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );
    const ids = [...new Set(dto.enrollmentIds)];
    if (ids.length !== dto.enrollmentIds.length) {
      throw new BadRequestException('Bitta kurs ikki marta tanlangan');
    }
    const extrasById = new Map(
      (dto.courses ?? []).map((c) => [c.enrollmentId, c]),
    );
    if ([...extrasById.keys()].some((id) => !ids.includes(id))) {
      throw new BadRequestException(
        "Tanlanmagan kurs uchun ma'lumot yuborilgan",
      );
    }
    assertDay(dto.customer.birthDate);
    assertCourseExtras(dto.courses);
    const contractDate = tashkentDateStr(new Date());

    return this.prisma
      .$transaction(async (tx) => {
        const student = await tx.student.findFirst({
          where: { id: dto.studentId, companyId },
          select: STUDENT_FOR_CONTRACT,
        });
        if (!student || student.deletedAt) {
          throw new BadRequestException(
            "Arxivdagi o'quvchiga shartnoma tuzilmaydi",
          );
        }
        const birthDate = await this.ensureBirthDate(
          tx,
          student,
          dto.studentBirthDate,
          contractDate,
          companyId,
          userId,
        );
        const isMinor = isMinorOn(birthDate, contractDate);
        const problem = customerProblem(
          dto.customer.kind,
          dto.customer.kindOther,
          isMinor,
        );
        if (problem) throw new BadRequestException(problem);

        const branch = await tx.branch.findFirst({
          where: { id: branchId, companyId },
          select: BRANCH_FOR_CONTRACT,
        });
        if (!branch) throw new NotFoundException('Filial topilmadi');
        const missing = missingBranchFields(branch);
        if (missing.length > 0) {
          throw new BadRequestException(
            `Filial sozlamasida ${missing.join(', ')} kiritilmagan — shartnoma tuzishdan oldin to'ldiring`,
          );
        }

        const enrollments = await tx.enrollment.findMany({
          where: { id: { in: ids }, studentId: student.id, deletedAt: null },
          select: ENROLLMENT_FOR_CONTRACT,
        });
        if (enrollments.length !== ids.length) {
          throw new BadRequestException(
            "Kurs topilmadi yoki bu o'quvchiga tegishli emas",
          );
        }
        for (const e of enrollments) {
          if (e.status !== 'ACTIVE' && e.status !== 'FROZEN') {
            throw new BadRequestException(
              `${e.group.name} guruhidagi kurs faol emas`,
            );
          }
          if (e.group.course.paymentModel !== 'MONTHLY') {
            throw new BadRequestException(
              `${e.group.name}: 12 talik kurs uchun shartnoma hali yo'q`,
            );
          }
          if (e.contractDocument) {
            throw new ConflictException(
              `${e.group.name} guruhidagi kurs № ${e.contractDocument.number} shartnomada bor`,
            );
          }
        }

        const studentFields = {
          fullName: personName(student),
          birthDate,
          isMinor,
        };
        const fields: ContractFields = {
          branch: {
            name: branch.name,
            city: branch.city!.trim(),
            address: branch.address!.trim(),
            representativeName: branch.representativeName!.trim(),
            representativePosition: branch.representativePosition!.trim(),
          },
          student: studentFields,
          customer: buildCustomer(dto.customer, studentFields),
          courses: ids.map((id) =>
            buildCourseFields(
              enrollments.find((e) => e.id === id)!,
              student.discountPercent,
              extrasOf(extrasById.get(id)),
            ),
          ),
        };

        const number = await nextContractNumber(
          tx,
          companyId,
          contractDate.slice(0, 4),
        );
        const doc = await tx.contractDocument.create({
          data: {
            companyId,
            number,
            studentId: student.id,
            branchId,
            templateVersion: CONTRACT_TEMPLATE_VERSION,
            contractDate: utcMidnightFromDateStr(contractDate),
            fields: fields as unknown as Prisma.InputJsonValue,
            createdById: userId,
          },
        });
        const linked = await tx.enrollment.updateMany({
          where: { id: { in: ids }, contractDocumentId: null },
          data: { contractDocumentId: doc.id },
        });
        if (linked.count !== ids.length) {
          throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
        }
        await this.history.recordCreate({
          entityType: 'Student',
          entityId: student.id,
          newValues: {
            action: 'SHARTNOMA_TUZILDI',
            raqam: number,
            kurslar: courseList(fields.courses),
          },
          changedById: userId,
          companyId,
          tx,
        });
        return loadContractView(tx, doc.id);
      }, SERIALIZABLE)
      .catch((err: unknown) => rethrowAsConflict(err, { duplicate: true }));
  }

  /** The profile's birth date, or the one typed now — written only if empty (ADR-0039). */
  private async ensureBirthDate(
    tx: Prisma.TransactionClient,
    student: { id: number; dateOfBirth: Date | null },
    typed: string | undefined,
    today: string,
    companyId: number,
    userId: number,
  ): Promise<string> {
    if (student.dateOfBirth) return storedBirthDay(student.dateOfBirth);
    if (!typed) {
      throw new BadRequestException("O'quvchining tug'ilgan sanasini kiriting");
    }
    const problem = birthDateProblem(typed, today);
    if (problem) throw new BadRequestException(problem);
    await tx.student.updateMany({
      where: { id: student.id, dateOfBirth: null },
      data: { dateOfBirth: utcMidnightFromDateStr(typed) },
    });
    await this.history.recordUpdate({
      entityType: 'Student',
      entityId: student.id,
      oldValues: { dateOfBirth: null },
      newValues: { dateOfBirth: typed },
      changedById: userId,
      companyId,
      tx,
    });
    return typed;
  }
}
