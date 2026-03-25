import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UserQueryDto } from './dto/user-query.dto';
import { Prisma } from '@prisma/client';

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
  constructor(private prisma: PrismaService) {}

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

  async create(data: {
    id: number;
    name: string;
    companyId: number;
    login?: string;
    password?: string;
    phone?: string;
    gender?: 'MALE' | 'FEMALE';
    mainBranch?: number;
    roleIds?: number[];
    branchIds?: number[];
  }) {
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const user = await this.prisma.user.create({
      data: {
        id: data.id,
        name: data.name,
        phone: data.phone,
        gender: data.gender,
        companyId: data.companyId,
        mainBranch: data.mainBranch,
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
