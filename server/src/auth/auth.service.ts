import { Injectable, UnauthorizedException } from '@nestjs/common';
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
        company: { select: { id: true, name: true, subdomain: true, logo: true, phone: true } },
      },
    });

    if (!user || !user.isActive || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }

  private formatUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      photo: user.photo,
      gender: user.gender,
      balance: user.balance,
      companyId: user.companyId,
      mainBranch: user.mainBranch,
      roles: user.roles.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })),
      branches: user.branches.map((ub: any) => ub.branch),
      company: user.company,
    };
  }

  private generateTokens(userId: number, roles: string[], companyId: number) {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    const payload = { sub: userId, roles, companyId };

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

  async login(user: any) {
    const roles = user.roles.map((ur: any) => ur.role.name);
    const tokens = this.generateTokens(user.id, roles, user.companyId);

    return {
      ...tokens,
      user: this.formatUser(user),
    };
  }

  async refresh(refreshToken: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET')!;
      const payload = this.jwtService.verify(refreshToken, { secret });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Noto\'g\'ri token turi');
      }

      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        include: {
          roles: { include: { role: true } },
          branches: { include: { branch: { select: { id: true, name: true } } } },
          company: { select: { id: true, name: true, subdomain: true, logo: true, phone: true } },
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Foydalanuvchi topilmadi yoki bloklangan');
      }

      const roles = user.roles.map((ur) => ur.role.name);
      const tokens = this.generateTokens(user.id, roles, user.companyId);

      return {
        ...tokens,
        user: this.formatUser(user),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token yaroqsiz yoki muddati tugagan');
    }
  }
}
