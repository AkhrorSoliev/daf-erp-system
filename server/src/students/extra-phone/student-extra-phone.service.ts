import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EskizService } from '../../eskiz/eskiz.service';
import { EntityHistoryService } from '../../common/entity-history';
import { StudentOnboardingService } from '../onboarding/student-onboarding.service';
import { canVerifyBySms } from '../shared/student-onboarding';
import { assertExtraPhoneFree } from '../shared/extra-phone-rule';
import { assertCurrentPassword } from '../shared/current-password';
import {
  INVALID_CODE_MESSAGE,
  type PhoneCodeDeps,
  type SendResult,
  assertNumberNotFlooded,
  assertVerifyAllowed,
  clearCode,
  hashCode,
  issuePhoneCode,
  readStoredCode,
  rejectCode,
} from '../shared/phone-code';

export type ExtraPhoneStatus = { phone: string | null; editable: boolean };

export const EXTRA_PHONE_DOOR_CLOSED_MESSAGE =
  "Zaxira raqamni hozircha administrator qo'shadi";

/**
 * The student's own backup number (ADR-0070): a second sign-in key they add,
 * change or remove behind their current password (ADR-0031); a new number is
 * proved by an SMS code to it first (ADR-0039's machinery, its own code slot).
 * The door is open only while the ADR-0039 phone step is switched on — the
 * SMS text needs Eskiz's approval before a code can arrive.
 */
@Injectable()
export class StudentExtraPhoneService {
  private readonly logger = new Logger(StudentExtraPhoneService.name);
  private readonly globalHourlyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eskiz: EskizService,
    private readonly entityHistory: EntityHistoryService,
    config: ConfigService,
    private readonly onboarding: StudentOnboardingService,
  ) {
    this.globalHourlyCap =
      Number(config.get<string>('PHONE_VERIFY_SMS_GLOBAL_HOURLY_CAP', '300')) ||
      300;
  }

  async status(studentId: number): Promise<ExtraPhoneStatus> {
    const student = await this.load(studentId);
    return this.toStatus(student.extraPhone);
  }

  /** Order: door → number shape → password → the rule → limits → SMS. */
  async sendCode(
    studentId: number,
    userId: number,
    phone: string,
    currentPassword: string,
  ): Promise<SendResult> {
    const student = await this.load(studentId);
    this.assertDoorOpen();
    if (!canVerifyBySms(phone)) {
      throw new BadRequestException(
        "Telefon raqam 9 xonali O'zbekiston raqami bo'lishi kerak",
      );
    }
    if (phone === student.extraPhone) {
      throw new BadRequestException('Bu raqam allaqachon zaxira raqamingiz');
    }
    // The password first: a caller without it learns nothing about numbers.
    await assertCurrentPassword(this.prisma, userId, currentPassword);
    await assertExtraPhoneFree(
      this.prisma,
      phone,
      this.self(student),
      'student',
    );
    await assertNumberNotFlooded(this.redis, phone);
    return issuePhoneCode(this.codeDeps, 'extra', student, phone, {
      typedByStudent: true,
    });
  }

  async verify(
    studentId: number,
    userId: number,
    code: string,
  ): Promise<ExtraPhoneStatus> {
    await assertVerifyAllowed(this.redis, studentId);
    const student = await this.load(studentId);
    this.assertDoorOpen();

    const stored = await readStoredCode(this.redis, 'extra', studentId);
    if (!stored) throw new BadRequestException(INVALID_CODE_MESSAGE);
    if (hashCode(code) !== stored.h) {
      await rejectCode(this.redis, 'extra', studentId, stored);
    }
    await clearCode(this.redis, 'extra', studentId);

    // Again at write time: the number may have been taken since the code went.
    await assertExtraPhoneFree(
      this.prisma,
      stored.p,
      this.self(student),
      'student',
    );
    await this.prisma.student.update({
      where: { id: studentId },
      data: { extraPhone: stored.p },
    });
    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { extraPhone: student.extraPhone, sabab: null },
      newValues: {
        extraPhone: stored.p,
        sabab: "O'quvchi o'zi qo'shdi, SMS bilan tasdiqladi",
      },
      changedById: userId,
      companyId: student.companyId,
    });
    return this.toStatus(stored.p);
  }

  async remove(
    studentId: number,
    userId: number,
    currentPassword: string,
  ): Promise<ExtraPhoneStatus> {
    const student = await this.load(studentId);
    this.assertDoorOpen();
    if (!student.extraPhone) {
      throw new BadRequestException("Zaxira raqam yo'q");
    }
    await assertCurrentPassword(this.prisma, userId, currentPassword);
    await this.prisma.student.update({
      where: { id: studentId },
      data: { extraPhone: null },
    });
    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { extraPhone: student.extraPhone, sabab: null },
      newValues: { extraPhone: null, sabab: "O'quvchi o'zi o'chirdi" },
      changedById: userId,
      companyId: student.companyId,
    });
    return this.toStatus(null);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async load(studentId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        extraPhone: true,
        companyId: true,
        userId: true,
      },
    });
    if (!student) throw new NotFoundException('Talaba topilmadi');
    return student;
  }

  private self(student: { id: number; userId: number | null; phone: string }) {
    return {
      studentId: student.id,
      userId: student.userId,
      phone: student.phone,
    };
  }

  private toStatus(phone: string | null): ExtraPhoneStatus {
    return { phone, editable: this.onboarding.phoneVerificationEnabled };
  }

  private assertDoorOpen(): void {
    if (!this.onboarding.phoneVerificationEnabled) {
      throw new BadRequestException(EXTRA_PHONE_DOOR_CLOSED_MESSAGE);
    }
  }

  private get codeDeps(): PhoneCodeDeps {
    return {
      prisma: this.prisma,
      redis: this.redis,
      eskiz: this.eskiz,
      logger: this.logger,
      globalHourlyCap: this.globalHourlyCap,
    };
  }
}
