import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { generateUniqueLogin, generatePassword } from '../telegram/utils/login-generator';

const TEACHER_ROLE_ID = 4;

const teacherSelect = {
  id: true,
  name: true,
  phone: true,
  photo: true,
  gender: true,
  login: true,
  balance: true,
  isActive: true,
  companyId: true,
  mainBranch: true,
  telegramChatId: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  company: { select: { id: true, name: true } },
  groupTeachers: {
    where: { group: { deletedAt: null } },
    select: { groupId: true },
  },
} satisfies Prisma.UserSelect;

function formatTeacher(user: any) {
  const { groupTeachers, ...rest } = user;
  return {
    ...rest,
    roles: user.roles.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })),
    branches: user.branches.map((ub: any) => ub.branch),
    groupCount: groupTeachers?.length ?? 0,
  };
}

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async findAll(query: TeacherQueryDto) {
    const { page = 1, per_page = 10, search, branch_id } = query;
    const skip = (page - 1) * per_page;

    const where: Prisma.UserWhereInput = {
      roles: { some: { roleId: TEACHER_ROLE_ID } },
      deletedAt: null,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (branch_id) {
      where.branches = { some: { branchId: branch_id } };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: per_page,
        select: teacherSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map(formatTeacher),
      total,
      page,
      per_page,
    };
  }

  async findById(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, roles: { some: { roleId: TEACHER_ROLE_ID } }, deletedAt: null },
      select: teacherSelect,
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    return formatTeacher(user);
  }

  async create(dto: CreateTeacherDto, companyId: number) {
    // Telefon raqam tekshirish
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('Bu telefon raqam allaqachon tizimda mavjud');
    }

    // Login va parol generatsiya
    const login = await generateUniqueLogin(dto.firstName, dto.lastName, this.prisma);
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: `${dto.firstName} ${dto.lastName}`,
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

  async update(id: number, dto: UpdateTeacherDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, roles: { some: { roleId: TEACHER_ROLE_ID } }, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    // Eski rasmni o'chirish (yangi rasm kelsa yoki null bo'lsa)
    if (dto.photo !== undefined && user.photo && dto.photo !== user.photo) {
      await this.uploadService.deleteFile(user.photo);
    }

    const name =
      dto.firstName && dto.lastName
        ? `${dto.firstName} ${dto.lastName}`
        : dto.firstName
          ? `${dto.firstName} ${user.name.split(' ').slice(1).join(' ')}`
          : dto.lastName
            ? `${user.name.split(' ')[0]} ${dto.lastName}`
            : undefined;

    // Login uniqueness tekshirish
    if (dto.login && dto.login !== user.login) {
      const loginTaken = await this.prisma.user.findFirst({ where: { login: dto.login, deletedAt: null } });
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
        ...(name && { name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.photo !== undefined && { photo: dto.photo }),
        ...(dto.login !== undefined && { login: dto.login }),
        ...(hashedPassword && { password: hashedPassword }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: teacherSelect,
    });

    return formatTeacher(updated);
  }

  async delete(id: number, deletedById: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, roles: { some: { roleId: TEACHER_ROLE_ID } }, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    // Rasmni O'CHIRMAYMIZ — restore uchun kerak
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById },
    });

    return { message: "O'qituvchi muvaffaqiyatli o'chirildi" };
  }

  async findGroupsByTeacherId(teacherId: number) {
    // Ensure teacher exists
    const user = await this.prisma.user.findFirst({
      where: { id: teacherId, roles: { some: { roleId: TEACHER_ROLE_ID } }, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${teacherId} topilmadi`);
    }

    const groups = await this.prisma.group.findMany({
      where: {
        teachers: { some: { teacherId } },
        deletedAt: null,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            level: true,
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
              select: { id: true, name: true, phone: true, photo: true },
            },
          },
        },
        _count: {
          select: {
            enrollments: { where: { deletedAt: null } },
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
