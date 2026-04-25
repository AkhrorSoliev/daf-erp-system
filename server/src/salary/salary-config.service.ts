import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryType } from '@prisma/client';
import {
  CreateSalaryConfigDto,
  GlobalSalaryConfigDto,
  UpdateSalaryConfigDto,
} from './dto/salary-config.dto';

@Injectable()
export class SalaryConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(userId: number, companyId: number) {
    return this.prisma.employeeSalaryConfig.findMany({
      where: { userId, companyId, isActive: true },
      select: {
        id: true,
        salaryType: true,
        value: true,
        isActive: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createConfig(dto: CreateSalaryConfigDto, companyId: number) {
    if (dto.salaryType === SalaryType.FIXED_MONTHLY && dto.groupId) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turi guruh bilan bog'lab bo'lmaydi",
      );
    }

    const existing = await this.prisma.employeeSalaryConfig.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId ?? null,
        companyId,
      },
    });

    if (existing) {
      return this.prisma.employeeSalaryConfig.update({
        where: { id: existing.id },
        data: {
          salaryType: dto.salaryType,
          value: dto.value,
          isActive: true,
        },
      });
    }

    return this.prisma.employeeSalaryConfig.create({
      data: {
        userId: dto.userId,
        groupId: dto.groupId ?? null,
        salaryType: dto.salaryType,
        value: dto.value,
        companyId,
      },
    });
  }

  async applyGlobalConfig(dto: GlobalSalaryConfigDto, companyId: number) {
    if (dto.salaryType === SalaryType.FIXED_MONTHLY) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turini global qo'llab bo'lmaydi — har xodim uchun alohida belgilang",
      );
    }

    const teachers = await this.prisma.groupTeacher.findMany({
      where: {
        group: { deletedAt: null, companyId },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });

    const results = await Promise.all(
      teachers.map(async (t) => {
        const existing = await this.prisma.employeeSalaryConfig.findFirst({
          where: { userId: t.teacherId, groupId: null, companyId },
        });
        if (existing) {
          return this.prisma.employeeSalaryConfig.update({
            where: { id: existing.id },
            data: {
              salaryType: dto.salaryType,
              value: dto.value,
              isActive: true,
            },
          });
        }
        return this.prisma.employeeSalaryConfig.create({
          data: {
            userId: t.teacherId,
            groupId: null,
            salaryType: dto.salaryType,
            value: dto.value,
            companyId,
          },
        });
      }),
    );

    return { updated: results.length };
  }

  async updateConfig(
    id: string,
    dto: UpdateSalaryConfigDto,
    companyId: number,
  ) {
    const existing = await this.prisma.employeeSalaryConfig.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Salary config topilmadi');

    if (dto.salaryType === SalaryType.FIXED_MONTHLY && existing.groupId) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turi guruh bilan bog'lab bo'lmaydi",
      );
    }

    return this.prisma.employeeSalaryConfig.update({
      where: { id },
      data: {
        ...(dto.salaryType && { salaryType: dto.salaryType }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
