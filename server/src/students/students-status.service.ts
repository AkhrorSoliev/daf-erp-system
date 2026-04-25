import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { studentSelect, formatStudent } from './shared/student-select';

@Injectable()
export class StudentsStatusService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async changeStatus(
    id: number,
    dto: ChangeStudentStatusDto,
    userId: number,
    companyId: number,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    // GRADUATED: faqat faol enrollment-i yo'q o'quvchiga ruxsat
    if (dto.status === StudentStatus.GRADUATED) {
      const activeCount = await this.prisma.enrollment.count({
        where: { studentId: id, deletedAt: null, status: 'ACTIVE' },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          "Faol guruhlari bor o'quvchini bitirgan deb belgilab bo'lmaydi",
        );
      }
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: dto.status,
      reason: dto.reason,
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    const isActive = dto.status === StudentStatus.ACTIVE;

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        status: dto.status,
        isActive,
        ...auditData,
      },
      select: studentSelect,
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Student',
      entityId: id,
      oldValues: { status: student.status },
      newValues: { status: dto.status, reason: dto.reason },
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    // Cascade: ARCHIVED/EXPELLED → enrollment larni yangilash
    await this.statusCascadeService.cascade(
      'Student',
      String(id),
      dto.status,
      userId,
    );

    return formatStudent(updated);
  }
}
