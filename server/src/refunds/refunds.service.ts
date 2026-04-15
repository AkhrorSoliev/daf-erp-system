import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AttendanceStatus, ContractStatus, RefundStatus } from '@prisma/client';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ProcessRefundDto } from './dto/process-refund.dto';

@Injectable()
export class RefundsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * Calculate refund amount and create a refund request.
   */
  async create(dto: CreateRefundDto, userId: number, companyId: number) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, deletedAt: null, companyId },
      select: {
        id: true,
        studentId: true,
        courseId: true,
        groupId: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        startDate: true,
        course: {
          select: { price: true, lessonPaymentCount: true },
        },
      },
    });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    if (contract.studentId !== dto.studentId) {
      throw new BadRequestException("Shartnoma bu o'quvchiga tegishli emas");
    }
    if (contract.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException('Faqat faol shartnomadan refund so\'rash mumkin');
    }

    // Count completed lessons (PRESENT or LATE)
    let lessonsCompleted = 0;
    if (contract.groupId) {
      lessonsCompleted = await this.prisma.attendance.count({
        where: {
          groupId: contract.groupId,
          studentId: dto.studentId,
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      });
    }

    const totalLessons = contract.course.lessonPaymentCount;
    const perLessonCost = Math.round(contract.course.price / totalLessons);

    // Check refund eligibility
    let requestedAmount: number;

    if (!contract.startDate || (contract.startDate > new Date())) {
      // Kurs boshlanmagan — 100% qaytarish
      requestedAmount = contract.paidAmount;
    } else if (lessonsCompleted / totalLessons >= 0.5) {
      // 50% dan ko'pi o'tilgan — qaytarilMAYDI
      throw new BadRequestException(
        "Kursning 50% dan ortiq qismi o'tilgan. Pul qaytarilmaydi",
      );
    } else {
      // Hisob-kitob: o'tilgan darslar narxini ushlab qolish
      const lessonDeduction = lessonsCompleted * perLessonCost;
      requestedAmount = Math.max(0, contract.paidAmount - lessonDeduction);
    }

    const deductions = {
      lessons: lessonsCompleted * perLessonCost,
      tax: 0,
      bankFee: 0,
    };

    const refund = await this.prisma.refund.create({
      data: {
        studentId: dto.studentId,
        contractId: dto.contractId,
        requestedAmount,
        lessonsCompleted,
        totalLessons,
        deductions,
        status: RefundStatus.REQUESTED,
        reason: dto.reason,
        companyId,
      },
    });

    return {
      ...refund,
      perLessonCost,
      lessonDeduction: deductions.lessons,
    };
  }

  async findAll(companyId: number) {
    return this.prisma.refund.findMany({
      where: { companyId },
      select: {
        id: true,
        requestedAmount: true,
        approvedAmount: true,
        lessonsCompleted: true,
        totalLessons: true,
        status: true,
        reason: true,
        createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
        contract: { select: { id: true, contractNumber: true } },
        processedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve or reject a refund request, then process the actual refund.
   */
  async process(id: string, dto: ProcessRefundDto, userId: number) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        requestedAmount: true,
        status: true,
        companyId: true,
      },
    });
    if (!refund) throw new NotFoundException('Refund topilmadi');

    if (dto.status === RefundStatus.REJECTED) {
      return this.prisma.refund.update({
        where: { id },
        data: {
          status: RefundStatus.REJECTED,
          reason: dto.reason,
          processedById: userId,
          processedAt: new Date(),
        },
      });
    }

    if (dto.status === RefundStatus.COMPLETED) {
      if (refund.status !== RefundStatus.REQUESTED && refund.status !== RefundStatus.APPROVED) {
        throw new BadRequestException('Bu refundni qayta ishlash mumkin emas');
      }

      const approvedAmount = dto.approvedAmount ?? refund.requestedAmount;

      // Record refund transaction (deduct from student balance)
      await this.transactionsService.recordRefund({
        studentId: refund.studentId,
        amount: approvedAmount,
        refundId: refund.id,
        companyId: refund.companyId,
        performedById: userId,
      });

      // Update contract status
      await this.prisma.contract.update({
        where: { id: refund.contractId },
        data: {
          status: ContractStatus.REFUNDED,
          paidAmount: { decrement: approvedAmount },
        },
      });

      // Calculate due date (15 business days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 21); // ~15 business days

      return this.prisma.refund.update({
        where: { id },
        data: {
          status: RefundStatus.COMPLETED,
          approvedAmount,
          processedById: userId,
          processedAt: new Date(),
          dueDate,
        },
      });
    }

    // For APPROVED status
    return this.prisma.refund.update({
      where: { id },
      data: {
        status: dto.status,
        approvedAmount: dto.approvedAmount,
        processedById: userId,
        processedAt: new Date(),
      },
    });
  }
}
