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
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { generateUniqueLogin, generatePassword } from '../telegram/utils/login-generator';

const TEACHER_ROLE_ID = 4;
const DEFAULT_COMPANY_ID = 1001;

const teacherSelect = {
  id: true,
  name: true,
  phone: true,
  photo: true,
  gender: true,
  login: true,
  isActive: true,
  companyId: true,
  mainBranch: true,
  telegramChatId: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

function formatTeacher(user: any) {
  return {
    ...user,
    roles: user.roles.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })),
    branches: user.branches.map((ub: any) => ub.branch),
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
      where: { id, roles: { some: { roleId: TEACHER_ROLE_ID } } },
      select: teacherSelect,
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    return formatTeacher(user);
  }

  async create(dto: CreateTeacherDto) {
    // Telefon raqam tekshirish
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
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
        companyId: DEFAULT_COMPANY_ID,
        roles: { create: [{ roleId: TEACHER_ROLE_ID }] },
      },
      select: teacherSelect,
    });

    return {
      ...formatTeacher(user),
      generatedLogin: login,
      generatedPassword: password,
    };
  }

  async delete(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, roles: { some: { roleId: TEACHER_ROLE_ID } } },
    });

    if (!user) {
      throw new NotFoundException(`O'qituvchi #${id} topilmadi`);
    }

    // Rasmni Cloudflare R2 dan o'chirish
    if (user.photo) {
      await this.uploadService.deleteFile(user.photo);
    }

    // Avval role va branch bog'lanishlarini o'chirish
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    await this.prisma.userBranch.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });

    return { message: "O'qituvchi muvaffaqiyatli o'chirildi" };
  }
}
