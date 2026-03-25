import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: BranchQueryDto) {
    const where = query.company_id ? { companyId: query.company_id } : {};

    return this.prisma.branch.findMany({
      where,
      select: { id: true, name: true, address: true, phone: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: number) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    return branch;
  }

  async create(dto: CreateBranchDto) {
    const lastBranch = await this.prisma.branch.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const nextId = (lastBranch?.id ?? 0) + 1;

    return this.prisma.branch.create({
      data: {
        id: nextId,
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        companyId: dto.companyId,
      },
    });
  }

  async update(id: number, dto: UpdateBranchDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Branch #${id} topilmadi`);
    }

    return this.prisma.branch.update({
      where: { id },
      data: dto,
    });
  }
}
