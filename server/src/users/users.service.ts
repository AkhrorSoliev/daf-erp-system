import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Prisma } from '@prisma/client';
import { UploadService } from '../upload/upload.service';

const userSelect = {
  id: true,
  name: true,
  phone: true,
  photo: true,
  gender: true,
  balance: true,
  companyId: true,
  mainBranch: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  company: { select: { id: true, name: true, subdomain: true, logo: true, phone: true } },
} satisfies Prisma.UserSelect;

function formatUser(user: any) {
  return {
    ...user,
    roles: user.roles.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })),
    branches: user.branches.map((ub: any) => ub.branch),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async findAll(query: UserQueryDto) {
    const { user_type, branch_id, company_id, page = 1, per_page = 10 } = query;
    const skip = (page - 1) * per_page;

    const where: Prisma.UserWhereInput = {};

    if (company_id) {
      where.companyId = company_id;
    }

    if (user_type) {
      where.roles = { some: { role: { name: user_type } } };
    }

    if (branch_id) {
      where.branches = { some: { branchId: branch_id } };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: per_page,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map(formatUser),
      total,
      page,
      per_page,
    };
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`User #${id} topilmadi`);
    }

    return formatUser(user);
  }

  async findByLogin(login: string) {
    return this.prisma.user.findUnique({ where: { login } });
  }

  async updateProfile(id: number, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User #${id} topilmadi`);
    }

    // Rasm o'zgargan yoki o'chirilgan bo'lsa, eski rasmni R2 dan o'chiramiz
    if (dto.photo !== undefined && user.photo && dto.photo !== user.photo) {
      await this.uploadService.deleteFile(user.photo);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.photo !== undefined && { photo: dto.photo || null }),
      },
      select: userSelect,
    });

    return formatUser(updated);
  }

  async changePassword(id: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User #${id} topilmadi`);
    }

    if (!user.password) {
      throw new BadRequestException('Parol o\'rnatilmagan');
    }

    const isValid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Joriy parol noto\'g\'ri');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });

    return { message: 'Parol muvaffaqiyatli o\'zgartirildi' };
  }

  async create(data: {
    id?: number;
    name: string;
    companyId: number;
    login?: string;
    password?: string;
    phone?: string;
    photo?: string;
    gender?: 'MALE' | 'FEMALE';
    mainBranch?: number;
    telegramChatId?: string;
    roleIds?: number[];
    branchIds?: number[];
  }) {
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const user = await this.prisma.user.create({
      data: {
        ...(data.id !== undefined && { id: data.id }),
        name: data.name,
        phone: data.phone,
        photo: data.photo,
        gender: data.gender,
        companyId: data.companyId,
        mainBranch: data.mainBranch,
        telegramChatId: data.telegramChatId,
        login: data.login,
        password: hashedPassword,
        roles: data.roleIds
          ? { create: data.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
        branches: data.branchIds
          ? { create: data.branchIds.map((branchId) => ({ branchId })) }
          : undefined,
      },
      select: userSelect,
    });

    return formatUser(user);
  }
}
