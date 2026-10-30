import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { BarredLessonsService } from '../attendance/barred-lessons.service';
import { BarredLessonsChargeService } from '../billing/barred-lessons-charge.service';
import { RestoreBarredLessonsDto } from './dto/restore-barred-lessons.dto';

/**
 * Qaytishda admin kelgan kunlarni belgilaydi (ADR-0142). Ikkala yo'l ham
 * o'quvchini faollashtirish (`students.manage`) yoki guruhga qo'shish
 * (`students.enroll`) oynasidan ochiladi; filial o'quvchining o'zidan
 * tekshiriladi.
 */
@Controller('students')
export class StudentBarredLessonsController {
  constructor(
    private prisma: PrismaService,
    private barred: BarredLessonsService,
    private charge: BarredLessonsChargeService,
    private entityHistory: EntityHistoryService,
  ) {}

  @Get(':id/barred-lessons')
  @Can('students.manage', 'students.enroll')
  async list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    const flags = await this.barred.flags(companyId);
    if (!flags.restoreDialog) return { enabled: false, items: [] };
    return {
      enabled: true,
      items: await this.charge.outstandingForStudent(id, companyId),
    };
  }

  @Post(':id/barred-lessons/restore')
  @Can('students.manage', 'students.enroll')
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RestoreBarredLessonsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    const flags = await this.barred.flags(companyId);
    if (!flags.restoreDialog) {
      throw new BadRequestException(
        'Qaytishda kunlarni belgilash sozlamalarda yoqilmagan',
      );
    }
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: dto.enrollmentId, studentId: id },
      select: { group: { select: { name: true } } },
    });
    if (!enrollment) throw new BadRequestException('Yozilish topilmadi');

    const left = await this.charge.releasedDays(dto.enrollmentId);
    const releasedCount = left.reduce((n, r) => n + r.days.length, 0);
    const done = await this.charge.restore({
      enrollmentId: dto.enrollmentId,
      attendedDays: dto.attendedDays,
      companyId,
      reason: 'Qaytishda administrator kelgan kunlarni belgiladi',
      performedById: userId,
    });
    // «Hech biriga kelmagan» ham qaror: izi tarixda qoladi.
    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: id,
      oldValues: { 'Hisobdan chiqarilgan darslar': `${releasedCount} ta` },
      newValues: {
        'Hisobdan chiqarilgan darslar': `${releasedCount - done.lessons} ta (${enrollment.group.name}: ${done.lessons} tasiga kelgan, qarzga ${done.charged} so'm qo'shildi)`,
      },
      changedById: userId,
      companyId,
    });
    return { restoredLessons: done.lessons, charged: done.charged };
  }
}
