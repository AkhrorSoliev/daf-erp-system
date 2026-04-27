import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Prisma, UserStatus } from '@prisma/client';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  photo: true,
  gender: true,
  balance: true,
  login: true,
  companyId: true,
  mainBranch: true,
  isActive: true,
  status: true,
  telegramChatId: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  company: {
    select: { id: true, name: true, subdomain: true, logo: true, phone: true },
  },
  groupTeachers: {
    where: { group: { deletedAt: null } },
    select: { groupId: true },
  },
} satisfies Prisma.UserSelect;

function formatUser(user: any) {
  const { groupTeachers, ...rest } = user;
  return {
    ...rest,
    roles: user.roles.map((ur: any) => ({
      id: ur.role.id,
      name: ur.role.name,
    })),
    branches: user.branches.map((ub: any) => ub.branch),
    groupCount: groupTeachers?.length ?? 0,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findAll(query: UserQueryDto) {
    const {
      user_type,
      search,
      branch_id,
      company_id,
      page = 1,
      pageSize = 10,
    } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (company_id) {
      where.companyId = company_id;
    }

    if (user_type) {
      const types = user_type
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length === 1) {
        where.roles = { some: { role: { name: types[0] } } };
      } else if (types.length > 1) {
        where.roles = { some: { role: { name: { in: types } } } };
      }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (branch_id) {
      where.branches = { some: { branchId: branch_id } };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        select: userSelect,
        // Active users first, then by name alphabetically within each group
        orderBy: [
          { isActive: 'desc' },
          { firstName: 'asc' },
          { lastName: 'asc' },
        ],
      }),
      this.prisma.user.count({ where }),
    ]);

    // Calculate student counts per teacher
    const teacherIds = data
      .filter((u: any) => u.roles.some((ur: any) => ur.role.name === 'Teacher'))
      .map((u: any) => u.id);
    const studentCountMap = new Map<number, number>();

    if (teacherIds.length > 0) {
      const gts = await this.prisma.groupTeacher.findMany({
        where: { teacherId: { in: teacherIds }, group: { deletedAt: null } },
        select: {
          teacherId: true,
          group: {
            select: {
              enrollments: {
                where: { deletedAt: null, status: 'ACTIVE' },
                select: { id: true },
              },
            },
          },
        },
      });

      for (const gt of gts) {
        const prev = studentCountMap.get(gt.teacherId) ?? 0;
        studentCountMap.set(gt.teacherId, prev + gt.group.enrollments.length);
      }
    }

    return {
      data: data.map((u: any) => ({
        ...formatUser(u),
        studentCount: studentCountMap.get(u.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`User #${id} topilmadi`);
    }

    return formatUser(user);
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
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.photo !== undefined && { photo: dto.photo || null }),
      },
      select: userSelect,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'User',
      entityId: id,
      oldValues: user,
      newValues: updated,
      changedById: id,
      companyId: user.companyId,
    });

    return formatUser(updated);
  }

  async changePassword(id: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User #${id} topilmadi`);
    }

    if (!user.password) {
      throw new BadRequestException("Parol o'rnatilmagan");
    }

    const isValid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isValid) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });

    return { message: "Parol muvaffaqiyatli o'zgartirildi" };
  }

  async create(data: {
    id?: number;
    firstName: string;
    lastName: string;
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
    // Validate role IDs exist
    if (data.roleIds?.length) {
      const validRoles = await this.prisma.role.findMany({
        where: { id: { in: data.roleIds } },
        select: { id: true },
      });
      const validIds = validRoles.map((r) => r.id);
      const invalid = data.roleIds.filter((id) => !validIds.includes(id));
      if (invalid.length) {
        throw new BadRequestException(
          `Noto'g'ri role ID: ${invalid.join(', ')}`,
        );
      }
    }

    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    let user: any;
    try {
      user = await this.prisma.user.create({
        data: {
          ...(data.id !== undefined && { id: data.id }),
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          photo: data.photo || null,
          gender: data.gender || null,
          companyId: data.companyId,
          mainBranch: data.mainBranch || null,
          telegramChatId: data.telegramChatId || null,
          login: data.login || null,
          password: hashedPassword || null,
          roles: data.roleIds?.length
            ? { create: data.roleIds.map((roleId) => ({ roleId })) }
            : undefined,
          branches: data.branchIds?.length
            ? { create: data.branchIds.map((branchId) => ({ branchId })) }
            : undefined,
        },
        select: userSelect,
      });
    } catch (error: any) {
      if (error.code === 'P2003') {
        throw new BadRequestException(
          "Noto'g'ri filial yoki role ID ko'rsatilgan",
        );
      }
      if (error.code === 'P2002') {
        throw new BadRequestException('Bu login allaqachon mavjud');
      }
      throw error;
    }

    await this.entityHistoryService.recordCreate({
      entityType: 'User',
      entityId: user.id,
      newValues: user,
      companyId: data.companyId,
    });

    return formatUser(user);
  }

  async updateUser(id: number, dto: UpdateUserDto, changedById: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`Xodim #${id} topilmadi`);
    }

    const updateData: any = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.login !== undefined) updateData.login = dto.login;
    if (dto.gender !== undefined) updateData.gender = dto.gender;
    if (dto.mainBranch !== undefined) updateData.mainBranch = dto.mainBranch;
    if (dto.telegramChatId !== undefined)
      updateData.telegramChatId = dto.telegramChatId;
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      updateData.isActive = dto.status === UserStatus.ACTIVE;
    }
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Update roles if provided
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }

      // Update branches if provided
      if (dto.branchIds) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        await tx.userBranch.createMany({
          data: dto.branchIds.map((branchId) => ({ userId: id, branchId })),
        });
      }

      return tx.user.update({
        where: { id },
        data: updateData,
        select: userSelect,
      });
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'User',
      entityId: id,
      oldValues: user,
      newValues: updated,
      changedById,
      companyId: user.companyId,
    });

    return formatUser(updated);
  }

  async softDelete(id: number, deletedById: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`Xodim #${id} topilmadi`);
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById,
      },
    });

    await this.entityHistoryService.recordDelete({
      entityType: 'User',
      entityId: id,
      oldValues: user,
      changedById: deletedById,
      companyId: user.companyId,
    });

    return { message: "Xodim muvaffaqiyatli o'chirildi" };
  }
}
