import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Gender, SmsMessageStatus, SmsMessageType } from '@prisma/client';
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
import { STUDENT_ROLE_ID } from '../shared/student-select';
import { planPhoneChange } from '../../common/auth/phone-account-rules';
import { UpdateOnboardingProfileDto } from './dto/update-onboarding-profile.dto';

// ── Code policy — the forgot-password OTP's numbers, keyed on the student ────
// The caller is signed in, so there is nothing to hide about the account: the
// errors below say exactly what happened, unlike the anonymous reset flow.
const CODE_TTL_SEC = 5 * 60;
const CODE_MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_SEC = 60;
// Higher than the reset's 3: this step is compulsory, and a student whose SMS
// is slow should not be locked out of the app until tomorrow after three taps.
const DAILY_LIMIT = 5;
const DAILY_TTL_SEC = 24 * 60 * 60;
// A legitimate student needs at most 15 verify calls a day (5 codes × 3 tries).
const VERIFY_HOURLY_LIMIT = 30;
const HOUR_SEC = 60 * 60;
// Codes to one NEW number a day. The student chooses that number, so without
// this one account could keep texting a stranger (the per-student cap bounds
// the total, this bounds the victim).
const NUMBER_DAILY_LIMIT = 3;

const codeKey = (studentId: number) => `phone_verify:code:${studentId}`;
const cooldownKey = (studentId: number) => `phone_verify:cooldown:${studentId}`;
const dailyKey = (studentId: number) => `phone_verify:daily:${studentId}`;
const verifyKey = (studentId: number) => `phone_verify:verify:${studentId}`;
const globalKey = (hourBucket: number) => `phone_verify:global:${hourBucket}`;
const numberDailyKey = (phone: string) => `phone_verify:number_daily:${phone}`;

const INVALID_CODE_MESSAGE = "Kod noto'g'ri yoki muddati tugagan";
export const WRONG_CURRENT_PASSWORD_MESSAGE = "Joriy parol noto'g'ri";
export const NUMBER_TAKEN_MESSAGE =
  "Bu raqam boshqa o'quvchi hisobiga biriktirilgan. Administratorga murojaat qiling";

interface StoredCode {
  h: string; // sha256(code)
  n: number; // attempts left
  p: string; // the number the code went to
  /**
   * Set only when the student is REPLACING the card's number: the number the
   * card carried when the code was sent. The code then proves `p`, and a
   * correct code writes `p` onto the card in place of `from`.
   */
  from?: string;
}

type SendResult = { phone: string; expiresInSec: number; resendInSec: number };

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
    return this.issueCode(student, student.phone);
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
    await this.assertCurrentPassword(userId, currentPassword);
    await this.assertNumberFree(phone, student);

    const sentToNumber = Number(await this.redis.get(numberDailyKey(phone)));
    if ((sentToNumber || 0) >= NUMBER_DAILY_LIMIT) {
      throw new HttpException(
        "Bu raqamga bugun ko'p kod yuborildi. Ertaga qayta urinib ko'ring",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.issueCode(student, phone, student.phone);
  }

  /** Checks the code; on success the card's number is marked as proved. */
  async verifyPhoneCode(
    studentId: number,
    userId: number,
    code: string,
  ): Promise<OnboardingStatus> {
    if (
      (await this.hit(verifyKey(studentId), HOUR_SEC)) > VERIFY_HOURLY_LIMIT
    ) {
      throw new HttpException(
        "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const student = await this.load(studentId);
    if (isPhoneVerified(student)) return this.toStatus(student);
    this.assertStepOpen(student);

    const raw = await this.redis.get(codeKey(studentId));
    if (!raw) throw new BadRequestException(INVALID_CODE_MESSAGE);

    let stored: StoredCode;
    try {
      stored = JSON.parse(raw) as StoredCode;
    } catch {
      await this.redis.del(codeKey(studentId));
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    // The card must still carry the number it had when the code was sent.
    // Staff changing it in between voids the code: it was about a card that
    // no longer exists in that form.
    const replacing = stored.from !== undefined;
    if ((replacing ? stored.from : stored.p) !== student.phone) {
      await this.redis.del(codeKey(studentId));
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (this.hash(code) !== stored.h) {
      const left = stored.n - 1;
      if (left <= 0) {
        await this.redis.del(codeKey(studentId));
        throw new BadRequestException(
          "Kod noto'g'ri. Iltimos, yangi kod so'rang.",
        );
      }
      const ttl = await this.redis.ttl(codeKey(studentId));
      await this.redis.set(
        codeKey(studentId),
        JSON.stringify({ ...stored, n: left } satisfies StoredCode),
        'EX',
        ttl > 0 ? ttl : CODE_TTL_SEC,
      );
      throw new BadRequestException(
        `Kod noto'g'ri. Qolgan urinishlar: ${left}`,
      );
    }

    await this.redis.del(codeKey(studentId));
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

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: student.id },
        data: { phone: nextPhone },
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
        telefonTasdigi: 'tasdiqlanmagan',
      },
      newValues: {
        phone: nextPhone,
        login,
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

  private async assertCurrentPassword(
    userId: number,
    currentPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { password: true },
    });
    const ok =
      !!user?.password &&
      (await bcrypt.compare(currentPassword, user.password));
    if (!ok) throw new BadRequestException(WRONG_CURRENT_PASSWORD_MESSAGE);
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
      this.prisma.user.findFirst({
        where: {
          OR: [{ phone }, { login: phone }],
          deletedAt: null,
          roles: { some: { roleId: STUDENT_ROLE_ID } },
          ...(student.userId !== null && { id: { not: student.userId } }),
        },
        select: { id: true },
      }),
    ]);
    if (card || account) throw new BadRequestException(NUMBER_TAKEN_MESSAGE);
  }

  /**
   * Sends one code to `target` under the shared limits. `from` marks a
   * replacement of the card's number (see `StoredCode.from`).
   */
  private async issueCode(
    student: StudentFacts,
    target: string,
    from?: string,
  ): Promise<SendResult> {
    const studentId = student.id;
    const cooldown = await this.redis.ttl(cooldownKey(studentId));
    if (cooldown > 0) {
      throw new HttpException(
        `Kodni ${cooldown} soniyadan keyin qayta yuborish mumkin`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sentToday = Number(await this.redis.get(dailyKey(studentId))) || 0;
    if (sentToday >= DAILY_LIMIT) {
      throw new HttpException(
        "Bugungi SMS limiti tugadi. Ertaga qayta urinib ko'ring yoki administratorga murojaat qiling",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Global hourly circuit-breaker: the Eskiz balance is real money, and the
    // day this step is switched on every student asks at once.
    if (
      (await this.hit(globalKey(this.hourBucket()), HOUR_SEC)) >
      this.globalHourlyCap
    ) {
      this.logger.error(
        `Phone-verify global hourly cap (${this.globalHourlyCap}) reached — SMS suppressed`,
      );
      throw new HttpException(
        "Hozir SMS yuborish vaqtincha cheklangan. Birozdan keyin qayta urinib ko'ring",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.redis.set(
      cooldownKey(studentId),
      '1',
      'EX',
      RESEND_COOLDOWN_SEC,
    );
    await this.hit(dailyKey(studentId), DAILY_TTL_SEC);
    if (from !== undefined)
      await this.hit(numberDailyKey(target), DAILY_TTL_SEC);

    const code = String(randomInt(1000, 10000)); // 1000–9999, no leading zero
    await this.redis.set(
      codeKey(studentId),
      JSON.stringify({
        h: this.hash(code),
        n: CODE_MAX_ATTEMPTS,
        p: target,
        ...(from !== undefined && { from }),
      } satisfies StoredCode),
      'EX',
      CODE_TTL_SEC,
    );

    let errorMessage: string | null = null;
    try {
      await this.eskiz.sendSms(target, buildPhoneVerifyMessage(code));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Telefon tasdiqlash SMS yuborilmadi (student ${studentId}): ${errorMessage}`,
      );
    }
    await this.recordSms(
      student,
      from === undefined
        ? 'Telefon tasdiqlash kodi yuborildi'
        : `Yangi raqamni tasdiqlash kodi yuborildi: ${target}`,
      errorMessage,
    );

    if (errorMessage) {
      // Nothing reached the phone: the code is useless and the failure was
      // ours, so the student gets the attempt back.
      await this.redis.del(codeKey(studentId));
      await this.redis.decr(dailyKey(studentId));
      if (from !== undefined) await this.redis.decr(numberDailyKey(target));
      throw new ServiceUnavailableException(
        "SMS yuborilmadi. Birozdan keyin qayta urinib ko'ring",
      );
    }

    return {
      phone: target,
      expiresInSec: CODE_TTL_SEC,
      resendInSec: RESEND_COOLDOWN_SEC,
    };
  }

  /** Audit row — the code itself is never stored, only that one was sent. */
  private async recordSms(
    student: StudentFacts,
    content: string,
    errorMessage: string | null,
  ): Promise<void> {
    await this.prisma.smsMessage
      .create({
        data: {
          studentId: student.id,
          content,
          type: SmsMessageType.AUTO,
          status: errorMessage
            ? SmsMessageStatus.FAILED
            : SmsMessageStatus.SENT,
          errorMessage,
          companyId: student.companyId,
        },
      })
      .catch((e) =>
        this.logger.warn(`SmsMessage audit yozilmadi: ${(e as Error).message}`),
      );
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private hourBucket(): number {
    return Math.floor(Date.now() / (HOUR_SEC * 1000));
  }

  /** INCR + (re)set TTL on every hit, so the key is never left without one. */
  private async hit(key: string, ttlSec: number): Promise<number> {
    const n = await this.redis.incr(key);
    await this.redis.expire(key, ttlSec);
    return n;
  }
}

const STUDENT_SELECT = {
  id: true,
  phone: true,
  verifiedPhone: true,
  gender: true,
  dateOfBirth: true,
  companyId: true,
  userId: true,
} as const;

type StudentFacts = {
  id: number;
  phone: string;
  verifiedPhone: string | null;
  gender: Gender | null;
  dateOfBirth: Date | null;
  companyId: number;
  userId: number | null;
};

/**
 * The SMS text. Like the reset code's, it must byte-match a template Eskiz has
 * moderated, or the gateway rejects it — and this one is NOT the reset
 * template: the purpose clause differs, which is exactly what moderation
 * checks (resource name with its type + what the code is for). Submit
 * "DaF Sprachzentrum mobil ilovasida telefon raqamingizni tasdiqlash uchun kod: 0000"
 * for moderation before setting STUDENT_PHONE_VERIFICATION_ENABLED=true.
 * Pure ASCII = one SMS segment.
 */
export function buildPhoneVerifyMessage(code: string): string {
  return `DaF Sprachzentrum mobil ilovasida telefon raqamingizni tasdiqlash uchun kod: ${code}`;
}
