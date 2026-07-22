import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, UserStatus, EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  USER_DEACTIVATED_EVENT,
  UserDeactivatedEvent,
} from '../common/events/user-lifecycle.events';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { ChangeTeacherStatusDto } from './dto/change-teacher-status.dto';
import {
  generateUniqueLogin,
  generatePassword,
} from '../telegram/utils/login-generator';

const TEACHER_ROLE_ID = 4;

const teacherSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  photo: true,
  gender: true,
  login: true,
  balance: true,
  isActive: true,
  status: true,
  companyId: true,
  mainBranch: true,
  telegramChatId: true,
  createdAt: true,
  updatedAt: true,
  statusChangedAt: true,
  statusChangedById: true,
  statusChangeReason: true,
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  company: { select: { id: true, name: true } },
  groupTeachers: {
    where: { group: { deletedAt: null } },
    select: { groupId: true },
  },
} satisfies Prisma.UserSelect;

function formatTeacher(user: any, studentCount = 0) {
  const { groupTeachers, ...rest } = user;
  return {
    ...rest,
    roles: user.roles.map((ur: any) => ({
      id: ur.role.id,
      name: ur.role.name,
    })),
    branches: user.branches.map((ub: any) => ub.branch),
    groupCount: groupTeachers?.length ?? 0,
    studentCount,
  };
}

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private statusHistoryService: StatusHistoryService,
    private entityHistoryService: EntityHistoryService,
    private redis: RedisService,
    private events: EventEmitter2,
  ) {}

  async findAll(query: TeacherQueryDto, companyId: number) {
    const { page = 1, pageSize = 10, search, branch_id } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      roles: { some: { roleId: TEACHER_ROLE_ID } },
      deletedAt: null,
      companyId,
    };

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
        select: teacherSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // O'qituvchining "O'quvchilar soni" — o'quvchilar sahifasidagi o'qituvchi
    // filtri bilan BIR XIL bo'lishi shart: o'qituvchining o'chirilmagan
    // guruhlaridagi o'chirilmagan enrollmentga ega ALOHIDA (distinct)
    // o'quvchilar. Enrollment statusi bo'yicha cheklov YO'Q — filtr ham
    // FROZEN/DROPPED o'quvchilarni ko'rsatadi, shu sabab ular ham sanaladi.
    // (Eski mantiq faqat ACTIVE enrollmentlarni sanab, pauza qilingan
    // guruhda 0 ko'rsatardi — filtr esa 7 ta beradi; hamda bir o'quvchini
    // ikki guruhda ikki marta sanardi.)
    const teacherIds = data.map((t: any) => t.id);
    const studentCountMap = new Map<number, number>();

    if (teacherIds.length > 0) {
      const gts = await this.prisma.groupTeacher.findMany({
        where: { teacherId: { in: teacherIds }, group: { deletedAt: null } },
        select: {
          teacherId: true,
          group: {
            select: {
              enrollments: {
                where: { deletedAt: null, student: { deletedAt: null } },
                select: { studentId: true },
              },
            },
          },
        },
      });

      const studentSets = new Map<number, Set<number>>();
      for (const gt of gts) {
        let set = studentSets.get(gt.teacherId);
        if (!set) {
          set = new Set<number>();
          studentSets.set(gt.teacherId, set);
        }
        for (const e of gt.group.enrollments) set.add(e.studentId);
      }
      for (const [tid, set] of studentSets) {
        studentCountMap.set(tid, set.size);
      }
    }

    return {
      data: data.map((t: any) =>
        formatTeacher(t, studentCountMap.get(t.id) ?? 0),
      ),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: number, companyId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        deletedAt: null,
        companyId,
      },
      select: teacherSelect,
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    // findAll bilan bir xil ta'rif: o'qituvchining o'chirilmagan
    // guruhlaridagi o'chirilmagan enrollmentga ega ALOHIDA o'quvchilar
    // (status bo'yicha cheklovsiz) — o'quvchilar filtri natijasiga mos.
    const count = await this.prisma.student.count({
      where: {
        deletedAt: null,
        enrollments: {
          some: {
            deletedAt: null,
            group: {
              deletedAt: null,
              teachers: { some: { teacherId: id } },
            },
          },
        },
      },
    });

    return formatTeacher(user, count);
  }

  async create(dto: CreateTeacherDto, companyId: number) {
    // Telefon raqam tekshirish
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Bu telefon raqam allaqachon tizimda mavjud',
      );
    }

    // Login va parol generatsiya
    const login = await generateUniqueLogin(
      dto.firstName,
      dto.lastName,
      this.prisma,
    );
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        photo: dto.photo,
        gender: dto.gender,
        login,
        password: hashedPassword,
        companyId,
        mainBranch: dto.branchId ?? null,
        roles: { create: [{ roleId: TEACHER_ROLE_ID }] },
        branches: dto.branchId
          ? { create: [{ branchId: dto.branchId }] }
          : undefined,
      },
      select: teacherSelect,
    });

    return {
      ...formatTeacher(user),
      generatedLogin: login,
      generatedPassword: password,
    };
  }

  async update(id: number, dto: UpdateTeacherDto, companyId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        deletedAt: null,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    // Eski rasmni o'chirish (yangi rasm kelsa yoki null bo'lsa)
    if (dto.photo !== undefined && user.photo && dto.photo !== user.photo) {
      await this.uploadService.deleteFile(user.photo);
    }

    // Login uniqueness tekshirish
    if (dto.login && dto.login !== user.login) {
      const loginTaken = await this.prisma.user.findFirst({
        where: { login: dto.login, deletedAt: null },
      });
      if (loginTaken) {
        throw new BadRequestException('Bu login allaqachon band');
      }
    }

    // Parolni hash qilish
    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.photo !== undefined && { photo: dto.photo }),
        ...(dto.login !== undefined && { login: dto.login }),
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: teacherSelect,
    });

    return formatTeacher(updated);
  }

  async changeStatus(
    id: number,
    dto: ChangeTeacherStatusDto,
    userId: number,
    companyId: number,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        deletedAt: null,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'User',
      entityId: String(id),
      fromStatus: user.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: user.companyId,
    });

    const isActive = dto.status === UserStatus.ACTIVE;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: dto.status,
        isActive,
        ...auditData,
      },
      select: teacherSelect,
    });

    // Redis: bloklangan user ni belgilash yoki tiklash
    try {
      if (
        dto.status === UserStatus.SUSPENDED ||
        dto.status === UserStatus.TERMINATED
      ) {
        await this.redis.set(`user:blocked:${id}`, '1');
      } else if (dto.status === UserStatus.ACTIVE) {
        await this.redis.del(`user:blocked:${id}`);
      }
    } catch {
      // Redis ulanmagan bo'lsa ham status o'zgaradi
    }

    // Deactivated / terminated → stop any fixed-monthly payroll for this user.
    if (dto.status !== UserStatus.ACTIVE) {
      this.events.emit(USER_DEACTIVATED_EVENT, {
        userId: id,
        companyId: user.companyId,
      } satisfies UserDeactivatedEvent);
    }

    return formatTeacher(updated);
  }

  async getStatusHistory(id: number, companyId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        companyId,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('User', String(id));
  }

  async delete(id: number, deletedById: number, companyId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        deletedAt: null,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    // Guruhlardan olib tashlash + tarixga yozish
    const teacherGroups = await this.prisma.groupTeacher.findMany({
      where: { teacherId: id },
      include: { group: { select: { id: true, name: true, companyId: true } } },
    });

    if (teacherGroups.length > 0) {
      await this.prisma.groupTeacher.deleteMany({ where: { teacherId: id } });

      for (const gt of teacherGroups) {
        await this.entityHistoryService.recordDelete({
          entityType: 'Group',
          entityId: gt.group.id,
          oldValues: {
            action: 'USTOZ_OLIB_TASHLANDI',
            ustoz: `${user.firstName} ${user.lastName}`,
            sabab: "O'qituvchi arxivlandi",
          },
          changedById: deletedById,
          companyId: gt.group.companyId ?? undefined,
        });
      }
    }

    // Soft delete — status transition emas, arxivlash
    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ARCHIVED,
        isActive: false,
        deletedAt: new Date(),
        deletedById,
        statusChangedAt: new Date(),
        statusChangedById: deletedById,
        statusChangeReason: "O'chirildi",
      },
    });

    // Redis: bloklangan user belgilash (xatoni e'tiborsiz qoldirish)
    try {
      await this.redis.set(`user:blocked:${id}`, '1');
    } catch {
      // Redis ulanmagan bo'lsa ham delete ishlaydi
    }

    // Archived → stop any fixed-monthly payroll for this user.
    this.events.emit(USER_DEACTIVATED_EVENT, {
      userId: id,
      companyId: user.companyId,
    } satisfies UserDeactivatedEvent);

    return { message: "O'qituvchi muvaffaqiyatli o'chirildi" };
  }

  async findGroupsByTeacherId(teacherId: number, companyId: number) {
    // Ensure teacher exists (and belongs to the caller's company)
    const user = await this.prisma.user.findFirst({
      where: {
        id: teacherId,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
        deletedAt: null,
        companyId,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${teacherId} topilmadi`);
    }

    const groups = await this.prisma.group.findMany({
      where: {
        teachers: { some: { teacherId } },
        deletedAt: null,
        companyId,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            description: true,
            lessonDuration: true,
            lessonMinutes: true,
            courseDuration: true,
            price: true,
            isActive: true,
          },
        },
        room: {
          select: { id: true, name: true, capacity: true },
        },
        branch: {
          select: { id: true, name: true },
        },
        teachers: {
          include: {
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                photo: true,
              },
            },
          },
        },
        _count: {
          select: {
            // Guruhdagi "O'quvchilar soni" — faqat AYNAN HOZIR o'qiyotgan
            // (ACTIVE) o'quvchilar. FROZEN/COMPLETED/DROPPED/TRANSFERRED
            // (muzlatilgan/bitirgan/chiqib ketgan/o'tgan) sanalmaydi, aks holda
            // guruhda haqiqiy faol o'quvchilardan ko'p ko'rsatilardi.
            enrollments: {
              where: {
                deletedAt: null,
                status: EnrollmentStatus.ACTIVE,
                student: { deletedAt: null },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((group) => {
      const { _count, teachers, ...rest } = group;
      return {
        ...rest,
        teachers: teachers.map((gt: any) => gt.teacher),
        studentCount: _count?.enrollments ?? 0,
      };
    });
  }
}
