import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { resolveAllowedRoleIds } from './portal-roles.config';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { consumeLoginRequest } from '../telegram/flows/app-login-otp-flow';
import { normalizeSharedPhone } from '../common/utils/phone.util';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from './token-lifetimes';
import { EntityHistoryService } from '../common/entity-history';
import {
  SESSION_ENDED_MESSAGE,
  endSessionsWrite,
  recordSessionsEnded,
  tokenSessionVersion,
} from '../common/auth/session-version';
import { STUDENT_ROLE_ID } from '../students/shared/student-select';
import { isStudentOnlyAccount } from '../common/auth/student-account';

export const STUDENT_ACCOUNT_CLOSED_MESSAGE =
  "Hisobingiz yopilgan. Administrator bilan bog'laning.";

/**
 * The branches a session carries, on every path that issues one: sign-in,
 * the student app login and token refresh. `status` is for the admin panel,
 * which does not offer a student registration link for a branch the Telegram
 * bot refuses (any status but ACTIVE). For everyone but a CEO, this list is
 * where the panel reads that status.
 */
const SESSION_BRANCHES = {
  include: { branch: { select: { id: true, name: true, status: true } } },
} satisfies Prisma.User$branchesArgs;

/**
 * Everything a session response needs from the account row. One shape for
 * sign-in, the app's OTP poll, `refresh` and `issueSession`, so they cannot
 * drift apart.
 */
const SESSION_USER_INCLUDE = {
  roles: { include: { role: true } },
  branches: SESSION_BRANCHES,
  company: {
    select: {
      id: true,
      name: true,
      subdomain: true,
      logo: true,
      phone: true,
    },
  },
} satisfies Prisma.UserInclude;

type SessionUser = Prisma.UserGetPayload<{
  include: typeof SESSION_USER_INCLUDE;
}>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private entityHistory: EntityHistoryService,
  ) {}

  /**
   * Kimlik qidiruvining YAGONA manbasi: `where` + `orderBy` + `include`.
   *
   * NEGA AJRATILGAN: `findAccountByIdentifier` (parol yo'li) va
   * `findAccountsByIdentifier` (Telegram OAuth yo'li) bir xil shartni
   * ishlatishi SHART. Shartni ikki joyga ko'chirsak, `OR` ro'yxati yoki status
   * filtri bir joyda o'zgarib, parolsiz yo'l parollidan kengroq bo'lib qolishi
   * mumkin edi.
   */
  private buildAccountLookup(login: string, allowedRoleIds?: number[] | null) {
    const identifier = (login ?? '').trim();
    const digits = identifier.replace(/\D/g, '');
    // Bot saqlagan ko'rinishga keltiramiz: O'zbekiston → 9 xona, chet el →
    // mamlakat kodi bilan. Bir manba — common/utils/phone.util.
    const normalized = digits ? normalizeSharedPhone(digits) : null;

    // Kimligi: telefon (staff `phone`, o'quvchi `login`=telefon), yoki eski
    // username. Xom raqam ham qo'shiladi — ba'zi legacy qatorlarda telefon
    // 998 prefiksi bilan saqlangan bo'lishi mumkin.
    const candidates: Array<{ login?: string; phone?: string }> = [
      { login: identifier },
    ];
    for (const value of [normalized, digits]) {
      if (!value) continue;
      candidates.push({ phone: value }, { login: value });
    }
    // Dublikatsiz — bir xil shart ikki marta ketmasin.
    const seen = new Set<string>();
    const or = candidates.filter((clause) => {
      const key = JSON.stringify(clause);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      where: {
        OR: or,
        deletedAt: null,
        // SUSPENDED / TERMINATED / ARCHIVED users cannot log in.
        status: { in: [UserStatus.ACTIVE, UserStatus.INACTIVE] },
        ...(allowedRoleIds && allowedRoleIds.length
          ? { roles: { some: { role: { id: { in: allowedRoleIds } } } } }
          : {}),
      },
      orderBy: { updatedAt: 'desc' as const },
      include: SESSION_USER_INCLUDE,
    };
  }

  /**
   * Kimlikni (telefon yoki eski username) akkauntga aylantiradi.
   *
   * NEGA AJRATILGAN: parol bilan kirish va Telegram OAuth bir xil qoidadan
   * foydalanishi SHART — aks holda parolsiz yo'l parollidan kengroq bo'lib
   * qolishi mumkin. Parol tekshiruvi ataylab bu yerda emas.
   */
  async findAccountByIdentifier(
    login: string,
    allowedRoleIds?: number[] | null,
  ) {
    return this.prisma.user.findFirst(
      this.buildAccountLookup(login, allowedRoleIds),
    );
  }

  /**
   * Xuddi shu shart bilan BIR NECHTA mos akkauntni qaytaradi (`take` bilan
   * cheklangan, tartib `findAccountByIdentifier` bilan bir xil).
   *
   * NEGA KERAK: `User.phone` unique emas, `User.login` esa faqat tirik
   * qatorlar orasida unique va yangi hisobda bo'sh bo'lishi mumkin — ya'ni
   * bitta telefon bir necha akkauntga tegishli bo'lishi mumkin (bir odam —
   * har rolga alohida hisob, ADR-0022; yoki ofis
   * raqami — kassirda ham, administratorda ham). Parol bilan kirishda
   * `updatedAt desc` bo'yicha "g'olib"ni tanlash zararsiz: o'sha akkauntga
   * kirish uchun baribir O'SHA akkauntning paroli kerak. Parolsiz yo'lda
   * (Telegram OAuth) esa bu ikkinchi omilni olib tashlaydi va odamni BEGONA
   * akkauntga kiritib qo'yishi mumkin — shuning uchun u yo'l noaniqlikni
   * ko'rishi va yopiq holatga o'tishi kerak. Bu yerda faqat sanaladi; qarorni
   * chaqiruvchi qabul qiladi.
   */
  async findAccountsByIdentifier(
    login: string,
    allowedRoleIds?: number[] | null,
    take = 2,
  ) {
    return this.prisma.user.findMany({
      ...this.buildAccountLookup(login, allowedRoleIds),
      take,
    });
  }

  /**
   * Validate a login attempt. The identifier is now the user's **phone number**
   * for every role (the login screen types a phone), but the legacy `login`
   * (username) is still accepted as a fallback so no account is locked out.
   *
   * `allowedRoleIds` scopes the lookup to the calling portal's roles (from the
   * `Origin` / `X-Portal` header). This is what disambiguates a phone that is
   * shared across accounts: on admin.dafzentrum.uz only staff-role accounts are
   * considered, on lehrer only teachers, on student only students. If several
   * still match (a genuinely duplicated phone within one portal), the most
   * recently updated account wins. `null` = no restriction (localhost/dev).
   */
  async validateUser(
    login: string,
    password: string,
    allowedRoleIds?: number[] | null,
  ) {
    const user = await this.findAccountByIdentifier(login, allowedRoleIds);

    if (!user || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }

  private formatUser(user: any, studentId?: number) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      photo: user.photo,
      gender: user.gender,
      balance: user.balance,
      companyId: user.companyId,
      mainBranch: user.mainBranch,
      roles: user.roles.map((ur: any) => ({
        id: ur.role.id,
        name: ur.role.name,
      })),
      branches: user.branches.map((ub: any) => ub.branch),
      company: user.company,
      ...(studentId !== undefined && { studentId }),
    };
  }

  private generateTokens(
    userId: number,
    roles: string[],
    companyId: number,
    sessionVersion: number,
    studentId?: number,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    // `sv` ties both tokens to the account's session version: a password
    // change or "log out other devices" bumps it, and every token minted
    // before that stops working (ADR-0030).
    const payload: Record<string, any> = {
      sub: userId,
      roles,
      companyId,
      sv: sessionVersion,
    };
    if (studentId) payload.studentId = studentId;

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh', sv: sessionVersion },
      { secret, expiresIn: REFRESH_TOKEN_TTL_SEC },
    );

    return { accessToken, refreshToken };
  }

  /**
   * The tail every session response shares: the student id (role 6, refused
   * for a student-only account with no live card — ADR-0033), both
   * tokens stamped with the account's CURRENT session version, and the user
   * payload.
   */
  private async sessionFor(user: SessionUser) {
    const roles = user.roles.map((ur) => ur.role.name);
    const roleIds = user.roles.map((ur) => ur.role.id);

    const studentId = await this.resolveStudentId(user.id, roleIds);

    const tokens = this.generateTokens(
      user.id,
      roles,
      user.companyId,
      user.sessionVersion,
      studentId,
    );

    return {
      ...tokens,
      user: this.formatUser(user, studentId),
    };
  }

  /**
   * The account behind a session that is being renewed or re-issued: live,
   * and not in a blocked status. Sign-in has its own, stricter lookup.
   */
  private async loadSessionUser(userId: number): Promise<SessionUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: SESSION_USER_INCLUDE,
    });

    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.TERMINATED ||
      user.status === UserStatus.ARCHIVED
    ) {
      throw new UnauthorizedException('Hisobingiz bloklangan');
    }

    return user;
  }

  /**
   * The live card behind an account holding the Student role, or nothing.
   *
   * A student-only account whose card is archived or gone is refused
   * (ADR-0033). Archiving closes the account, so this only fires when the two
   * have drifted — and the token it would get carries no `studentId`: every
   * portal page then fails with a misleading "check your internet", and any
   * read that trusts `studentId` loses its filter. An account that also holds
   * a staff role signs in as staff, as before.
   */
  private async resolveStudentId(
    userId: number,
    roleIds: number[],
  ): Promise<number | undefined> {
    if (!roleIds.includes(STUDENT_ROLE_ID)) return undefined;
    const student = await this.prisma.student.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (student) return student.id;
    if (isStudentOnlyAccount(roleIds)) {
      throw new UnauthorizedException(STUDENT_ACCOUNT_CLOSED_MESSAGE);
    }
    return undefined;
  }

  async login(user: any, origin?: string, portal?: string) {
    const allowedRoleIds = resolveAllowedRoleIds(origin, portal);
    if (allowedRoleIds !== null) {
      const userRoleIds: number[] = user.roles.map((ur: any) => ur.role.id);
      const hasAccess = userRoleIds.some((id) => allowedRoleIds.includes(id));
      if (!hasAccess) {
        throw new ForbiddenException(
          'Sizning rolingiz bu portalga kirish huquqiga ega emas',
        );
      }
    }

    return this.sessionFor(user);
  }

  /** Poll a link-based app login request; pending until the bot approves it. */
  async pollLoginRequest(requestId: string) {
    if (!requestId) return { status: 'pending' as const };
    const userId = await consumeLoginRequest(this.redis, requestId);
    if (!userId) return { status: 'pending' as const };
    const session = await this.buildStudentSession(userId);
    return { status: 'approved' as const, ...session };
  }

  /** Load a student user, enforce the role-6 gate, and issue a session. */
  private async buildStudentSession(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: SESSION_USER_INCLUDE,
    });

    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }
    if (user.status !== 'ACTIVE' && user.status !== 'INACTIVE') {
      throw new UnauthorizedException('Hisobingiz bloklangan');
    }

    const roleIds: number[] = user.roles.map((ur) => ur.role.id);
    if (!roleIds.includes(STUDENT_ROLE_ID)) {
      throw new ForbiddenException("Bu faqat o'quvchilar uchun");
    }

    return this.sessionFor(user);
  }

  async refresh(refreshToken: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET')!;
      const payload = this.jwtService.verify(refreshToken, { secret });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException("Noto'g'ri token turi");
      }

      const user = await this.loadSessionUser(payload.sub);

      // The database is the authority; `JwtAuthGuard`'s Redis check only gets
      // there sooner. A token minted before the last password change or
      // "log out other devices" carries an older version and is refused.
      if (tokenSessionVersion(payload) !== user.sessionVersion) {
        throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
      }

      return await this.sessionFor(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(
        'Refresh token yaroqsiz yoki muddati tugagan',
      );
    }
  }

  /**
   * A fresh token pair for an account that is already authenticated — the
   * device that just changed its own password or pressed "log out other
   * devices". Both actions bumped the session version, retiring this device's
   * tokens along with everyone else's; without a new pair it would be signed
   * out on its very next request.
   *
   * `sessionVersion` is the version the caller's OWN write produced, never
   * one read back here: if another bump (the owner's password change, a
   * reset) landed in between, it must win, and a pair signed with the older
   * number stops on its next request.
   */
  async issueSession(userId: number, sessionVersion: number) {
    const user = await this.loadSessionUser(userId);
    return this.sessionFor({ ...user, sessionVersion });
  }

  /**
   * "Log out other devices": end every session of the account, then hand the
   * device that asked a fresh pair so it stays signed in (ADR-0030).
   *
   * The bump is a compare-and-set on the CALLER's version. A token that is
   * already behind — one the guard let through while Redis was unavailable,
   * or one whose session ended mid-request — is refused here and changes
   * nothing, instead of minting itself a current session.
   */
  async logoutOtherSessions(userId: number, callerVersion: number) {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, sessionVersion: callerVersion },
      data: endSessionsWrite(),
    });
    if (count !== 1) {
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    }
    const sessionVersion = callerVersion + 1;
    await recordSessionsEnded(this.redis, userId, sessionVersion);

    // Journaled where staff look for it: the student card for a student, the
    // employee record for everyone else.
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, student: { select: { id: true } } },
    });
    await this.entityHistory.recordUpdate({
      entityType: account?.student ? 'Student' : 'User',
      entityId: account?.student?.id ?? userId,
      oldValues: { kirishlar: 'faol' },
      newValues: { kirishlar: 'boshqa qurilmalardan chiqildi' },
      changedById: userId,
      companyId: account?.companyId,
    });

    return this.issueSession(userId, sessionVersion);
  }
}
