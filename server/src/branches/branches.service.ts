import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BranchQueryDto } from './dto/branch-query.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: BranchQueryDto) {
    const where = query.company_id ? { companyId: query.company_id } : {};

    return this.prisma.branch.findMany({
      where,
      select: { id: true, name: true },
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
}
