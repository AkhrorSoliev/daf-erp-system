import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { getAllowedRoleIds } from './portal-roles.config';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(login: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { login, deletedAt: null },
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

    if (!user || !user.password) {
      return null;
    }

    // SUSPENDED yoki TERMINATED userlar login qila olmaydi
    if (user.status !== 'ACTIVE' && user.status !== 'INACTIVE') {
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

  async login(user: any, origin?: string) {
    const allowedRoleIds = getAllowedRoleIds(origin);
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
