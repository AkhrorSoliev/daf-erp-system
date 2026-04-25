import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { ChangePortalPasswordDto } from './dto/change-portal-password.dto';
import { UpdatePortalNameDto } from './dto/update-portal-name.dto';

/** Intent expires 1 hour after creation */
const INTENT_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class StudentPortalWriteService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async updateName(
    studentId: number,
    dto: UpdatePortalNameDto,
    userId: number,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        userId: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: { firstName: dto.firstName, lastName: dto.lastName },
      select: { id: true, firstName: true, lastName: true },
    });

    if (student.userId) {
      await this.prisma.user.update({
        where: { id: student.userId },
        data: { firstName: dto.firstName, lastName: dto.lastName },
      });
    }

    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { firstName: student.firstName, lastName: student.lastName },
      newValues: { firstName: dto.firstName, lastName: dto.lastName },
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    return updated;
  }

  async changePassword(
    userId: number,
    studentId: number,
    dto: ChangePortalPasswordDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const isValid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isValid) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    if (studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: { companyId: true },
      });
      await this.entityHistoryService.recordUpdate({
        entityType: 'Student',
        entityId: studentId,
        oldValues: { parol: '***' },
        newValues: { parol: "o'zgartirildi" },
        changedById: userId,
        companyId: student?.companyId ?? undefined,
      });
    }

    return { message: "Parol muvaffaqiyatli o'zgartirildi" };
  }

  async updatePhoto(
    studentId: number,
    file: Express.Multer.File,
    userId: number,
  ) {
    if (!file) {
      throw new BadRequestException('Rasm yuklanmadi');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, photo: true, companyId: true, userId: true },
    });

    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    if (student.photo) {
      await this.uploadService.deleteFile(student.photo);
    }

    const photoUrl = await this.uploadService.uploadFile(
      file,
      'student-photos',
    );

    await this.prisma.student.update({
      where: { id: studentId },
      data: { photo: photoUrl },
    });

    if (student.userId) {
      await this.prisma.user.update({
        where: { id: student.userId },
        data: { photo: photoUrl },
      });
    }

    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { rasm: 'eski rasm' },
      newValues: { rasm: 'yangi rasm yuklandi' },
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    return { photo: photoUrl };
  }

  /**
   * Create a PaymentIntent so the webhook can verify the expected amount.
   * Expires unused intents for the same student+provider before creating a new one.
   */
  async createPaymentIntent(params: {
    studentId: number;
    companyId: number;
    provider: PaymentMethod;
    amountSom: number;
  }) {
    await this.prisma.paymentIntent.updateMany({
      where: {
        studentId: params.studentId,
        companyId: params.companyId,
        provider: params.provider,
        used: false,
      },
      data: { used: true },
    });

    return this.prisma.paymentIntent.create({
      data: {
        studentId: params.studentId,
        companyId: params.companyId,
        provider: params.provider,
        amount: params.amountSom,
        amountTiyin: params.amountSom * 100,
        expiresAt: new Date(Date.now() + INTENT_TTL_MS),
      },
    });
  }
}
