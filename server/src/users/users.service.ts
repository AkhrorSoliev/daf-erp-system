import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

const CEO_ROLE_ID = 1;
const TEACHER_ROLE_ID = 4;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  private async assertRoleAndBranchRules(
    roleIds: number[] | undefined,
    branchIds: number[] | undefined,
    mainBranch: number | null | undefined,
    companyId: number,
    callerUserId?: number,
  ) {
    // Role escalation guard: only CEO can grant CEO role
    if (callerUserId && roleIds?.includes(CEO_ROLE_ID)) {
      const caller = await this.prisma.user.findUnique({
        where: { id: callerUserId },
        select: {
          roles: { select: { role: { select: { name: true } } } },
        },
      });
      const callerIsCeo =
        caller?.roles.some((r) => r.role.name === 'CEO') ?? false;
      if (!callerIsCeo) {
        throw new ForbiddenException(
          'CEO rolini faqat CEO tayinlashi mumkin',
        );
      }
    }

    if (!roleIds?.length) return;

    const hasCeoRole = roleIds.includes(CEO_ROLE_ID);
    const hasTeacherRole = roleIds.includes(TEACHER_ROLE_ID);
    const hasBranches = !!branchIds && branchIds.length > 0;

    // Teacher must have at least one branch (more specific error first)
    if (hasTeacherRole && !hasCeoRole && !hasBranches) {
      throw new BadRequestException(
        "O'qituvchi uchun kamida bitta filial tanlanishi shart",
      );
    }

    // Non-CEO employees must have at least one branch
    if (!hasCeoRole && !hasBranches) {
      throw new BadRequestException(
        "CEO bo'lmagan xodim uchun kamida bitta filial tanlanishi shart",
      );
    }

    // Branches must belong to the same company
    if (hasBranches) {
      const validCount = await this.prisma.branch.count({
        where: {
          id: { in: branchIds! },
          companyId,
          deletedAt: null,
        },
      });
      if (validCount !== branchIds!.length) {
        throw new BadRequestException(
          "Tanlangan filiallar bu kompaniyaga tegishli emas",
        );
      }
    }

    // mainBranch must be one of the selected branches
    if (mainBranch && hasBranches && !branchIds!.includes(mainBranch)) {
      throw new BadRequestException(
        "Asosiy filial tanlangan filiallar orasida bo'lishi kerak",
      );
    }
  }

  private assertSameCompany(
    targetCompanyId: number,
    callerCompanyId: number | undefined,
  ) {
    if (callerCompanyId !== undefined && targetCompanyId !== callerCompanyId) {
      throw new ForbiddenException(
        "Bu xodimga nisbatan amal bajarish huquqi yo'q",
      );
    }
  }

  async findAll(query: UserQueryDto, companyId: number) {
    const { user_type, search, branch_id, page = 1, pageSize = 10 } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
    };

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

    // We sort by student count (a computed field), so DB-level pagination
    // can't be used directly. Fetch all matching users, compute counts,
    // sort, and paginate in memory. Per-company user counts are small
    // enough (hundreds, not thousands) that this stays fast.
    const allRows = await this.prisma.user.findMany({
      where,
      select: userSelect,
    });

    const teacherIds = allRows
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

    const formatted = allRows.map((u: any) => ({
      ...formatUser(u),
      studentCount: studentCountMap.get(u.id) ?? 0,
    }));

    // Sort: active first, then by student count (desc), then alphabetically.
    // Non-teachers all have studentCount=0 so they collapse to alpha order.
    formatted.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.studentCount !== b.studentCount) {
        return b.studentCount - a.studentCount;
      }
      const fn = a.firstName.localeCompare(b.firstName);
      if (fn !== 0) return fn;
      return a.lastName.localeCompare(b.lastName);
    });

    const total = formatted.length;
    const data = formatted.slice(skip, skip + pageSize);

    return { data, total, page, pageSize };
  }

  async findById(id: number, companyId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
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

  async create(
    data: {
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
    },
    callerUserId?: number,
  ) {
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

    await this.assertRoleAndBranchRules(
      data.roleIds,
      data.branchIds,
      data.mainBranch,
      data.companyId,
      callerUserId,
    );

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

  async updateUser(
    id: number,
    dto: UpdateUserDto,
    changedById: number,
    callerCompanyId?: number,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`Xodim #${id} topilmadi`);
    }

    this.assertSameCompany(user.companyId, callerCompanyId);

    // If roles or branches are being modified, re-validate combined state
    if (dto.roleIds !== undefined || dto.branchIds !== undefined) {
      const nextRoleIds =
        dto.roleIds ?? user.roles.map((ur: any) => ur.role.id);
      const nextBranchIds =
        dto.branchIds ?? user.branches.map((ub: any) => ub.branch.id);
      const nextMainBranch =
        dto.mainBranch !== undefined ? dto.mainBranch : user.mainBranch;
      await this.assertRoleAndBranchRules(
        nextRoleIds,
        nextBranchIds,
        nextMainBranch,
        user.companyId,
        changedById,
      );
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

  async softDelete(
    id: number,
    deletedById: number,
    callerCompanyId?: number,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`Xodim #${id} topilmadi`);
    }

    this.assertSameCompany(user.companyId, callerCompanyId);

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
