import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { ContractStatus, Prisma } from '@prisma/client';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractQueryDto } from './dto/contract-query.dto';
import { ChangeContractStatusDto } from './dto/change-contract-status.dto';

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreateContractDto, userId: number, companyId: number) {
    // Verify student belongs to company
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, deletedAt: null, companyId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    // Verify course belongs to company
    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, deletedAt: null, companyId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Kurs topilmadi');

    // Generate contract number + create inside transaction to prevent race condition
    const contract = await this.prisma.$transaction(async (tx) => {
      const contractNumber = await this.generateContractNumber(companyId, tx);
      return tx.contract.create({
        data: {
          contractNumber,
          studentId: dto.studentId,
          courseId: dto.courseId,
          groupId: dto.groupId,
          branchId: dto.branchId,
          totalAmount: dto.totalAmount,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: ContractStatus.ACTIVE,
          signedAt: new Date(),
          companyId,
        },
      });
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Contract',
      entityId: contract.id,
      newValues: contract,
      changedById: userId,
      companyId,
    });

    return contract;
  }

  async findAll(query: ContractQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.ContractWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.status && { status: query.status }),
      ...(query.branchId && { branchId: query.branchId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        select: {
          id: true,
          contractNumber: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          course: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        contractNumber: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        startDate: true,
        endDate: true,
        signedAt: true,
        signedDocUrl: true,
        branchId: true,
        companyId: true,
        createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true, phone: true, passportSeries: true } },
        course: { select: { id: true, name: true, price: true, lessonPaymentCount: true } },
        group: { select: { id: true, name: true } },
        payments: {
          select: { id: true, amount: true, method: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    return contract;
  }

  async findByStudent(studentId: number, query: ContractQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.ContractWhereInput = {
      studentId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        select: {
          id: true,
          contractNumber: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          course: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async update(id: string, dto: UpdateContractDto, userId: number) {
    const existing = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Shartnoma topilmadi');

    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        ...(dto.groupId !== undefined && { groupId: dto.groupId }),
        ...(dto.totalAmount !== undefined && { totalAmount: dto.totalAmount }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.signedDocUrl !== undefined && { signedDocUrl: dto.signedDocUrl }),
      },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Contract',
      entityId: id,
      oldValues: existing,
      newValues: contract,
      changedById: userId,
      companyId: existing.companyId,
    });

    return contract;
  }

  async changeStatus(
    id: string,
    dto: ChangeContractStatusDto,
    userId: number,
  ) {
    const existing = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Shartnoma topilmadi');

    if (existing.status === dto.status) {
      throw new BadRequestException('Status allaqachon shu holatda');
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        status: dto.status,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: dto.reason,
      },
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Contract',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: existing.companyId,
    });

    return contract;
  }

  private async generateContractNumber(companyId: number, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();
    const prefix = `DAF-${year}-`;

    const lastContract = await db.contract.findFirst({
      where: {
        companyId,
        contractNumber: { startsWith: prefix },
      },
      orderBy: { contractNumber: 'desc' },
      select: { contractNumber: true },
    });

    let nextNum = 1;
    if (lastContract) {
      const lastNum = parseInt(lastContract.contractNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
