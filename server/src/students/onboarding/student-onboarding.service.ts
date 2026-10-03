import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gender } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EskizService } from '../../eskiz/eskiz.service';
import { EntityHistoryService } from '../../common/entity-history';
import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import {
  OnboardingStep,
  birthDateProblem,
  canVerifyBySms,
  isPhoneVerified,
  missingOnboardingSteps,
} from '../shared/student-onboarding';
import { markPhoneVerified } from '../shared/mark-phone-verified';
import { findStudentAccountOnNumber } from '../shared/extra-phone-rule';
import { planPhoneChange } from '../../common/auth/phone-account-rules';
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
import {
  WRONG_CURRENT_PASSWORD_MESSAGE,
  assertCurrentPassword,
} from '../shared/current-password';
import { UpdateOnboardingProfileDto } from './dto/update-onboarding-profile.dto';

// The spec imports these from here; the definitions moved to shared modules.
export { buildPhoneVerifyMessage } from '../shared/phone-code';
export { WRONG_CURRENT_PASSWORD_MESSAGE };

export const NUMBER_TAKEN_MESSAGE =
  "Bu raqam boshqa o'quvchi hisobiga biriktirilgan. Administratorga murojaat qiling";

export interface OnboardingStatus {
  /** Steps still owed, in the order the clients show them. Empty = done. */
  missing: OnboardingStep[];
  /** The card's number — where the code goes. The student's own data. */
  phone: string;
  phoneVerified: boolean;
}

/**
 * The student's first-run requirements (ADR-0039): prove the phone by SMS,
 * give gender and birth date. Both portals gate on `status()`.
 */
@Injectable()
export class StudentOnboardingService {
  private readonly logger = new Logger(StudentOnboardingService.name);
  private readonly verificationSwitchedOn: boolean;
  private readonly globalHourlyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eskiz: EskizService,
    private readonly entityHistory: EntityHistoryService,
    config: ConfigService,
  ) {
    // Off unless switched on. The SMS text needs its own Eskiz moderation
    // before a single code can be delivered, and a compulsory step whose SMS
    // never arrives locks every student out of the app — so a deploy without
    // the approval must degrade to "not asked", never to "stuck".
    this.verificationSwitchedOn =
      config.get<string>('STUDENT_PHONE_VERIFICATION_ENABLED') === 'true';
    this.globalHourlyCap =
      Number(config.get<string>('PHONE_VERIFY_SMS_GLOBAL_HOURLY_CAP', '300')) ||
      300;
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

  /** Also needs Eskiz credentials: without them no code can ever arrive. */
  get phoneVerificationEnabled(): boolean {
    return this.verificationSwitchedOn && this.eskiz.isConfigured();
  }

  async status(studentId: number): Promise<OnboardingStatus> {
    const student = await this.load(studentId);
    return this.toStatus(student);
  }

  /**
   * Fills gender and birth date — only the ones still empty. What staff
   * entered on the card stays authoritative; this door is for first-run data,
   * not a second editor of the card, so a repeated submit is a no-op.
   */
  async updateProfile(
    studentId: number,
    userId: number,
    dto: UpdateOnboardingProfileDto,
  ): Promise<OnboardingStatus> {
    const student = await this.load(studentId);

    const data: { gender?: Gender; dateOfBirth?: Date } = {};
    if (dto.gender && !student.gender) data.gender = dto.gender;
    if (dto.dateOfBirth && !student.dateOfBirth) {
      const problem = birthDateProblem(dto.dateOfBirth);
      if (problem) throw new BadRequestException(problem);
      data.dateOfBirth = utcMidnightFromDateStr(dto.dateOfBirth);
    }
    if (Object.keys(data).length === 0) return this.toStatus(student);

    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data,
      select: STUDENT_SELECT,
    });
    if (data.gender && student.userId) {
      // The account mirrors the card's gender (`User.gender`), as the name and
      // photo writes in StudentPortalWriteService do.
      await this.prisma.user.update({
        where: { id: student.userId },
        data: { gender: data.gender },
      });
    }

    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: {
        ...(data.gender && { gender: null }),
        ...(data.dateOfBirth && { dateOfBirth: null }),
      },
      newValues: {
        ...(data.gender && { gender: data.gender }),
        ...(data.dateOfBirth && { dateOfBirth: dto.dateOfBirth }),
      },
      changedById: userId,
      companyId: student.companyId,
    });

    return this.toStatus(updated);
  }

  /** «Ha, bu mening raqamim» — a 4-digit code to the number on the card. */
  async sendPhoneCode(studentId: number): Promise<SendResult> {
    const student = await this.load(studentId);
    this.assertStepOpen(student);
    if (!canVerifyBySms(student.phone)) {
      throw new BadRequestException(
        "Bu raqamga SMS yuborib bo'lmaydi. Administratorga murojaat qiling",
      );
    }
    return issuePhoneCode(this.codeDeps, 'card', student, student.phone, {
      typedByStudent: false,
    });
  }

  /**
   * «Yo'q, boshqa raqam» — the card carries a number that is not the
   * student's. The code goes to the number they type; a correct code then
   * puts that number on the card and the sign-in account, proved.
   *
   * The current password is required (ADR-0031): an SMS to the new number
   * proves only that the person at the keyboard holds THAT number, not that
   * they own this account. Without the password, anyone holding a signed-in
   * device could move the sign-in number to their own phone and then reset
   * the password by SMS. The password is checked before anything else, so a
   * caller without it learns nothing — not even whether a number is taken.
   */
  async sendChangeCode(
    studentId: number,
    userId: number,
    phone: string,
    currentPassword: string,
  ): Promise<SendResult> {
    const student = await this.load(studentId);
    this.assertStepOpen(student);
    if (!canVerifyBySms(phone)) {
      throw new BadRequestException(
        "Telefon raqam 9 xonali O'zbekiston raqami bo'lishi kerak",
      );
    }
    if (phone === student.phone) {
      throw new BadRequestException(
        'Bu raqam kartangizda turibdi — «Ha, kod yuborish» ni tanlang',
      );
    }
    await assertCurrentPassword(this.prisma, userId, currentPassword);
    await this.assertNumberFree(phone, student);

    await assertNumberNotFlooded(this.redis, phone);
    return issuePhoneCode(this.codeDeps, 'card', student, phone, {
      from: student.phone,
      typedByStudent: true,
    });
  }

  /** Checks the code; on success the card's number is marked as proved. */
  async verifyPhoneCode(
    studentId: number,
    userId: number,
    code: string,
  ): Promise<OnboardingStatus> {
    await assertVerifyAllowed(this.redis, studentId);

    const student = await this.load(studentId);
    if (isPhoneVerified(student)) return this.toStatus(student);
    this.assertStepOpen(student);

    const stored = await readStoredCode(this.redis, 'card', studentId);
    if (!stored) throw new BadRequestException(INVALID_CODE_MESSAGE);

    // The card must still carry the number it had when the code was sent.
    // Staff changing it in between voids the code: it was about a card that
    // no longer exists in that form.
    const replacing = stored.from !== undefined;
    if ((replacing ? stored.from : stored.p) !== student.phone) {
      await clearCode(this.redis, 'card', studentId);
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (hashCode(code) !== stored.h) {
      await rejectCode(this.redis, 'card', studentId, stored);
    }

    await clearCode(this.redis, 'card', studentId);
    if (replacing) {
      await this.replaceCardNumber(student, userId, stored.p);
      return this.status(studentId);
    }

    const marked = await markPhoneVerified(this.prisma, studentId, stored.p);
    if (!marked) throw new BadRequestException(INVALID_CODE_MESSAGE);

    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { telefonTasdigi: 'tasdiqlanmagan' },
      newValues: { telefonTasdigi: `${stored.p} SMS orqali tasdiqlandi` },
      changedById: userId,
      companyId: student.companyId,
    });

    return this.status(studentId);
  }

  /**
   * Writes the proved number onto the card and moves the sign-in account with
   * it, in one transaction (ADR-0032: the card's number IS the sign-in number;
   * `planPhoneChange` moves the login, or clears it when the number is some
   * other live account's login). The old number stops opening the account.
   */
  private async replaceCardNumber(
    student: StudentFacts,
    userId: number,
    nextPhone: string,
  ): Promise<void> {
    // Again at write time: the number may have been taken since the code went.
    await this.assertNumberFree(nextPhone, student);

    const account = student.userId
      ? await this.prisma.user.findFirst({
          where: { id: student.userId, deletedAt: null },
          select: { id: true, phone: true, login: true },
        })
      : null;
    // `staff: false`: this student's number may be the same person's staff
    // account number (ADR-0022).
    const write = account
      ? await planPhoneChange(this.prisma, account, nextPhone, { staff: false })
      : null;

    const promotesBackup = student.extraPhone === nextPhone;
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: student.id },
        // The backup number that just became the main number is not a
        // backup any more (ADR-0070).
        data: {
          phone: nextPhone,
          ...(promotesBackup && { extraPhone: null }),
        },
      });
      if (account && write) {
        await tx.user.update({ where: { id: account.id }, data: write });
      }
      if (!(await markPhoneVerified(tx, student.id, nextPhone))) {
        throw new BadRequestException(INVALID_CODE_MESSAGE);
      }
    });

    // One entry: the number, the login riding along (labelled «Login» in the
    // history tab, as on a staff edit) and the proof.
    const login = account
      ? write && 'login' in write
        ? write.login
        : account.login
      : null;
    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: student.id,
      oldValues: {
        phone: student.phone,
        login: account?.login ?? null,
        ...(promotesBackup && { extraPhone: student.extraPhone }),
        telefonTasdigi: 'tasdiqlanmagan',
      },
      newValues: {
        phone: nextPhone,
        login,
        ...(promotesBackup && { extraPhone: null }),
        telefonTasdigi: `${nextPhone} SMS orqali tasdiqlandi`,
        sabab: "O'quvchi eski raqam o'rniga o'z raqamini kiritdi",
      },
      changedById: userId,
      companyId: student.companyId,
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async load(studentId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: STUDENT_SELECT,
    });
    if (!student) throw new NotFoundException('Talaba topilmadi');
    return student;
  }

  private toStatus(student: StudentFacts): OnboardingStatus {
    return {
      missing: missingOnboardingSteps(student, {
        phoneVerificationEnabled: this.phoneVerificationEnabled,
      }),
      phone: student.phone,
      phoneVerified: isPhoneVerified(student),
    };
  }

  /** The phone step is open: switched on, and the card's number not proved yet. */
  private assertStepOpen(student: StudentFacts): void {
    if (isPhoneVerified(student)) {
      throw new BadRequestException(
        'Telefon raqamingiz allaqachon tasdiqlangan',
      );
    }
    if (!this.phoneVerificationEnabled) {
      throw new BadRequestException(
        "Telefonni tasdiqlash hozircha o'chirilgan",
      );
    }
  }

  /**
   * A number already signing another student in may not be taken by this
   * one. Card phones are unique among live students (the staff edit refuses
   * a taken one too), and two student accounts on one number leave sign-in
   * guessing which is meant — Telegram sign-in refuses both, SMS reset picks
   * the most recently touched. Staff accounts do not count: a student may
   * share a number with the same person's staff account (ADR-0022).
   */
  private async assertNumberFree(
    phone: string,
    student: StudentFacts,
  ): Promise<void> {
    const [card, account] = await Promise.all([
      this.prisma.student.findFirst({
        where: { phone, deletedAt: null, id: { not: student.id } },
        select: { id: true },
      }),
      findStudentAccountOnNumber(this.prisma, phone, student.userId),
    ]);
    if (card || account) throw new BadRequestException(NUMBER_TAKEN_MESSAGE);
  }
}

const STUDENT_SELECT = {
  id: true,
  phone: true,
  verifiedPhone: true,
  extraPhone: true,
  gender: true,
  dateOfBirth: true,
  companyId: true,
  userId: true,
} as const;

type StudentFacts = {
  id: number;
  phone: string;
  verifiedPhone: string | null;
  extraPhone: string | null;
  gender: Gender | null;
  dateOfBirth: Date | null;
  companyId: number;
  userId: number | null;
};
