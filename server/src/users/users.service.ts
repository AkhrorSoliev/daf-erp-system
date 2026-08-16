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
import {
  ReportBranchIds,
  userBranchWhere,
} from '../common/finance/report-branch-scope';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  USER_DEACTIVATED_EVENT,
  UserDeactivatedEvent,
} from '../common/events/user-lifecycle.events';
import {
  assertCallerMayTouchUser,
  assertCallerMayTouchUserRecord,
} from '../common/auth/user-branch-scope';
import { assertCallerInBranch } from '../common/auth/branch-scope';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  photo: true,
  gender: true,
  balance: true,
  login: true,
  position: true,
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
    private events: EventEmitter2,
  ) {}

  private async assertRoleAndBranchRules(
    roleIds: number[] | undefined,
    branchIds: number[] | undefined,
    mainBranch: number | null | undefined,
    companyId: number,
    callerUserId?: number,
    opts?: { position?: string | null; hasCredentials?: boolean },
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

    // A job title is what every list, badge and payroll row reads. It is the
    // one field that must be there whether or not the person can sign in.
    if (opts && opts.position !== undefined) {
      if (!opts.position?.trim()) {
        throw new BadRequestException("Lavozim ko'rsatilishi shart");
      }
    }

    const hasRoles = !!roleIds?.length;
    const hasBranches = !!branchIds && branchIds.length > 0;

    // No role means no sign-in, and a password is the second, independent
    // guarantee of that (`validateUser` refuses an account with none). Accept
    // one here and that guarantee is gone — so refuse rather than ignore.
    if (!hasRoles && opts?.hasCredentials) {
      throw new BadRequestException(
        "Tizim roli berilmagan xodimga login yoki parol berib bo'lmaydi",
      );
    }

    // A branch-less employee appears in no branch list and on no payroll
    // report, so this holds for the role-less too — which the old early
    // `return` skipped entirely.
    if (!hasRoles) {
      if (!hasBranches) {
        throw new BadRequestException(
          'Rolsiz xodim uchun kamida bitta filial tanlanishi shart',
        );
      }
    } else {
      const hasCeoRole = roleIds!.includes(CEO_ROLE_ID);
      const hasTeacherRole = roleIds!.includes(TEACHER_ROLE_ID);

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

    // …and the CALLER must hold every one of them.
    //
    // The check above reads like a branch check and is part of why this
    // survived — but it asks whether the branch is REAL, the same trap
    // `assertSingleValidBranch` set on students. Creating a user IS granting
    // access: without this, a Fargona director could create a Branch Director
    // OF NAMANGAN, with a password they chose, in a branch they cannot even
    // view. A CEO spans everything and passes; a caller who holds neither
    // branch is refused for both.
    for (const branchId of [
      ...(branchIds ?? []),
      ...(mainBranch != null ? [mainBranch] : []),
    ]) {
      await assertCallerInBranch(
        this.prisma,
        callerUserId,
        branchId,
        "Bu filialga xodim qo'shish huquqingiz yo'q",
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

  async findAll(
    query: UserQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const { user_type, search, active_only, page = 1, pageSize = 10 } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
      // Nested under AND because both this and the search filter below produce
      // an `OR` — see the same note in `teachers.service.ts`. This list feeds
      // the advance dialog and the task-assignee picker, which used to offer
      // every branch's staff.
      AND: [userBranchWhere(scope)],
    };

    // Assignee dropdowns (e.g. task assignment) pass active_only so that
    // deactivated/suspended/terminated employees are not offered. Mirror the
    // canonical "active recipient" predicate (status + isActive) — don't rely
    // on the sync invariant alone. The general employees list omits this and
    // intentionally still shows non-active staff for management.
    if (active_only) {
      where.isActive = true;
      where.status = UserStatus.ACTIVE;
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

  async findById(
    id: number,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    // `updateUser` was already branch-confined (`assertCallerMayTouchUser`)
    // because it can rewrite a password; the READ beside it was not, so one
    // branch's admin could still open another branch's employee record.
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
        AND: [userBranchWhere(scope)],
      },
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
      position?: string;
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

    const position = data.position?.trim() ?? '';

    await this.assertRoleAndBranchRules(
      data.roleIds,
      data.branchIds,
      data.mainBranch,
      data.companyId,
      callerUserId,
      { position, hasCredentials: !!(data.password || data.login) },
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
          position,
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

  /**
   * A non-CEO caller may only edit staff of their OWN branch.
   *
   * The rule itself now lives in `common/auth/user-branch-scope.ts`. It moved
   * out when comments on an employee profile became a second caller: a branch
   * rule with two private copies is exactly how three lesson modules ended up
   * unguarded while `attendance.controller` held the only copy.
   */
  private async assertCallerMayTouchUser(
    target: { id: number; mainBranch: number | null; branches: any[] },
    changedById: number,
  ): Promise<void> {
    if (target.id === changedById) return; // editing yourself is always fine

    const caller = await this.prisma.user.findFirst({
      where: { id: changedById, deletedAt: null },
      select: {
        mainBranch: true,
        branches: { select: { branchId: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!caller) throw new ForbiddenException('Foydalanuvchi topilmadi');

    // The target is already loaded here (via `userSelect`), so the record
    // variant is used rather than the loading one — same rule, one less query.
    assertCallerMayTouchUserRecord(target, caller, changedById);
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
    await this.assertCallerMayTouchUser(user as any, changedById);

    // If roles, branches, the job title, or credentials are being modified,
    // re-validate the combined state. `password`/`login` are included even
    // though they don't touch roles or branches: an explicit credential
    // write is exactly the case `assertRoleAndBranchRules` must see to
    // refuse it when the account (already, or as of this same request) has
    // no role — omitting them here is how a role-less account could
    // previously acquire a password through this endpoint alone.
    let nextRoleIds: number[] | undefined;
    if (
      dto.roleIds !== undefined ||
      dto.branchIds !== undefined ||
      dto.position !== undefined ||
      dto.password !== undefined ||
      dto.login !== undefined
    ) {
      nextRoleIds = dto.roleIds ?? user.roles.map((ur: any) => ur.role.id);
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
        {
          // Only validated when the caller actually sends one — an existing
          // employee with no title yet must stay editable.
          position: dto.position !== undefined ? dto.position : undefined,
          hasCredentials: !!(dto.password || dto.login),
        },
      );
    }

    const updateData: any = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.login !== undefined) updateData.login = dto.login;
    if (dto.position !== undefined) updateData.position = dto.position.trim();
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

    // Stripping an employee's last role IS removing their system access.
    // `assertRoleAndBranchRules` above only refuses an EXPLICIT credential
    // write landing on a role-less account — it cannot refuse this case,
    // because the DTO has no way to ask for a login/password to be cleared,
    // and refusing the demotion itself would make "turn an administrator
    // into a role-less cleaner" impossible through the UI. So when the
    // RESULTING role set is empty, the stored credentials are nulled here
    // instead: a bcrypt hash and a login that grant nothing are exactly what
    // "no role" is supposed to mean.
    if (nextRoleIds && nextRoleIds.length === 0) {
      updateData.password = null;
      updateData.login = null;
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

    // Deactivated / terminated → stop their fixed-monthly payroll (closes the
    // FIXED_MONTHLY config + version; the final partial month still prorates).
    if (dto.status !== undefined && dto.status !== UserStatus.ACTIVE) {
      this.events.emit(USER_DEACTIVATED_EVENT, {
        userId: id,
        companyId: user.companyId,
      } satisfies UserDeactivatedEvent);
    }

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
    // `updateUser` right beside this has been branch-confined since the
    // object-level sweep; archiving was not. Same record, same severity —
    // an archived employee loses their account — through the door nobody
    // locked.
    await assertCallerMayTouchUser(
      this.prisma,
      deletedById,
      id,
      "Siz faqat o'z filialingiz xodimlarini arxivlashingiz mumkin",
    );

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

    // Archived → stop their fixed-monthly payroll.
    this.events.emit(USER_DEACTIVATED_EVENT, {
      userId: id,
      companyId: user.companyId,
    } satisfies UserDeactivatedEvent);

    return { message: "Xodim muvaffaqiyatli o'chirildi" };
  }
}
