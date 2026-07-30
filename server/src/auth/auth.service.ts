import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { resolveAllowedRoleIds } from './portal-roles.config';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { consumeLoginRequest } from '../telegram/flows/app-login-otp-flow';
import { normalizeSharedPhone } from '../common/utils/phone.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
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
      include: {
        roles: { include: { role: true } },
        branches: { include: { branch: { select: { id: true, name: true } } } },
        company: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            logo: true,
            phone: true,
          },
        },
      },
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
   * NEGA KERAK: na `User.login`, na `User.phone` unique emas, ya'ni bitta
   * telefon bir necha akkauntga tegishli bo'lishi mumkin (masalan ofis
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
    studentId?: number,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    const payload: Record<string, any> = { sub: userId, roles, companyId };
    if (studentId) payload.studentId = studentId;

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: '1h',
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      { secret, expiresIn: '24h' },
    );

    return { accessToken, refreshToken };
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

    const roles = user.roles.map((ur: any) => ur.role.name);
    const roleIds: number[] = user.roles.map((ur: any) => ur.role.id);

    // Student role bo'lsa, studentId ni topish
    let studentId: number | undefined;
    if (roleIds.includes(6)) {
      const student = await this.prisma.student.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true },
      });
      studentId = student?.id;
    }

    const tokens = this.generateTokens(
      user.id,
      roles,
      user.companyId,
      studentId,
    );

    return {
      ...tokens,
      user: this.formatUser(user, studentId),
    };
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
      include: {
        roles: { include: { role: true } },
        branches: { include: { branch: { select: { id: true, name: true } } } },
        company: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            logo: true,
            phone: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }
    if (user.status !== 'ACTIVE' && user.status !== 'INACTIVE') {
      throw new UnauthorizedException('Hisobingiz bloklangan');
    }

    const roleIds: number[] = user.roles.map((ur: any) => ur.role.id);
    if (!roleIds.includes(6)) {
      throw new ForbiddenException("Bu faqat o'quvchilar uchun");
    }

    const roles = user.roles.map((ur: any) => ur.role.name);
    const student = await this.prisma.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    });
    const studentId = student?.id;

    const tokens = this.generateTokens(
      user.id,
      roles,
      user.companyId,
      studentId,
    );

    return {
      ...tokens,
      user: this.formatUser(user, studentId),
    };
  }

  async refresh(refreshToken: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET')!;
      const payload = this.jwtService.verify(refreshToken, { secret });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException("Noto'g'ri token turi");
      }

      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        include: {
          roles: { include: { role: true } },
          branches: {
            include: { branch: { select: { id: true, name: true } } },
          },
          company: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              logo: true,
              phone: true,
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException('Foydalanuvchi topilmadi');
      }

      if (
        user.status === 'SUSPENDED' ||
        user.status === 'TERMINATED' ||
        user.status === 'ARCHIVED'
      ) {
        throw new UnauthorizedException('Hisobingiz bloklangan');
      }

      const roles = user.roles.map((ur) => ur.role.name);
      const roleIds: number[] = user.roles.map((ur) => ur.role.id);

      let studentId: number | undefined;
      if (roleIds.includes(6)) {
        const student = await this.prisma.student.findFirst({
          where: { userId: user.id, deletedAt: null },
          select: { id: true },
        });
        studentId = student?.id;
      }

      const tokens = this.generateTokens(
        user.id,
        roles,
        user.companyId,
        studentId,
      );

      return {
        ...tokens,
        user: this.formatUser(user, studentId),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(
        'Refresh token yaroqsiz yoki muddati tugagan',
      );
    }
  }
}
