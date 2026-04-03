import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { ChangePortalPasswordDto } from './dto/change-portal-password.dto';
import { UpdatePortalNameDto } from './dto/update-portal-name.dto';

@Injectable()
export class StudentPortalService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async getProfile(studentId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        extraPhone: true,
        parentPhone: true,
        parentName: true,
        telegram: true,
        gender: true,
        dateOfBirth: true,
        photo: true,
        comment: true,
        balance: true,
        placeOfStudy: true,
        address: true,
        passportSeries: true,
        status: true,
        isActive: true,
        createdAt: true,
        userId: true,
        branches: {
          select: {
            branch: { select: { id: true, name: true } },
          },
        },
        enrollments: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: {
            id: true,
            createdAt: true,
            group: {
              select: {
                id: true,
                name: true,
                status: true,
                days: true,
                exactDays: true,
                lessonStartTime: true,
                lessonEndTime: true,
                startDate: true,
                endDate: true,
                course: { select: { id: true, name: true } },
                room: { select: { id: true, name: true } },
                teachers: {
                  include: {
                    teacher: {
                      select: { id: true, firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    const { enrollments, branches, dateOfBirth, userId, ...rest } = student;

    // Login ni User jadvalidan olish
    let login: string | null = null;
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { login: true },
      });
      login = user?.login ?? null;
    }

    return {
      ...rest,
      login,
      date_of_birth: dateOfBirth?.toISOString() ?? null,
      branches: branches.map((sb: any) => ({
        id: sb.branch.id,
        name: sb.branch.name,
      })),
      groups: enrollments.map((e: any) => ({
        id: e.group.id,
        enrollmentId: e.id,
        name: e.group.name,
        status: e.group.status,
        course_name: e.group.course?.name ?? null,
        days: e.group.days,
        exactDays: e.group.exactDays ?? [],
        lessonStartTime: e.group.lessonStartTime,
        lessonEndTime: e.group.lessonEndTime,
        startDate: e.group.startDate,
        endDate: e.group.endDate,
        room: e.group.room ?? null,
        teachers: (e.group.teachers ?? []).map((gt: any) => gt.teacher),
        enrolledAt: e.createdAt,
      })),
    };
  }

  async getSchedule(studentId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: 'ACTIVE',
        group: {
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING'] },
        },
      },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            days: true,
            exactDays: true,
            lessonStartTime: true,
            lessonEndTime: true,
            startDate: true,
            endDate: true,
            course: { select: { id: true, name: true } },
            room: { select: { id: true, name: true } },
            teachers: {
              include: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    return enrollments.map((e) => ({
      groupId: e.group.id,
      groupName: e.group.name,
      courseName: e.group.course?.name ?? null,
      days: e.group.days,
      exactDays: e.group.exactDays ?? [],
      lessonStartTime: e.group.lessonStartTime,
      lessonEndTime: e.group.lessonEndTime,
      startDate: e.group.startDate,
      endDate: e.group.endDate,
      teachers: (e.group.teachers ?? []).map((gt: any) => gt.teacher),
      room: e.group.room ?? null,
    }));
  }

  async getAttendanceStats(studentId: number) {
    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId },
      _count: true,
    });

    let total = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    for (const row of grouped) {
      total += row._count;
      switch (row.status) {
        case 'PRESENT':
          present = row._count;
          break;
        case 'ABSENT':
          absent = row._count;
          break;
        case 'LATE':
          late = row._count;
          break;
        case 'EXCUSED':
          excused = row._count;
          break;
      }
    }

    const percentage =
      total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { total, present, absent, late, excused, percentage };
  }

  async updateName(studentId: number, dto: UpdatePortalNameDto, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, companyId: true },
    });

    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: { firstName: dto.firstName, lastName: dto.lastName },
      select: { id: true, firstName: true, lastName: true },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { firstName: student.firstName, lastName: student.lastName },
      newValues: { firstName: dto.firstName, lastName: dto.lastName },
      changedById: userId,
      companyId: student.companyId,
    });

    return updated;
  }

  async changePassword(userId: number, studentId: number, dto: ChangePortalPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const isValid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Joriy parol noto\'g\'ri');
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
        newValues: { parol: 'o\'zgartirildi' },
        changedById: userId,
        companyId: student?.companyId,
      });
    }

    return { message: 'Parol muvaffaqiyatli o\'zgartirildi' };
  }

  async updatePhoto(studentId: number, file: Express.Multer.File, userId: number) {
    if (!file) {
      throw new BadRequestException('Rasm yuklanmadi');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, photo: true, companyId: true },
    });

    if (!student) {
      throw new NotFoundException('Talaba topilmadi');
    }

    if (student.photo) {
      await this.uploadService.deleteFile(student.photo);
    }

    const photoUrl = await this.uploadService.uploadFile(file, 'student-photos');

    await this.prisma.student.update({
      where: { id: studentId },
      data: { photo: photoUrl },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { photo: student.photo },
      newValues: { photo: photoUrl },
      changedById: userId,
      companyId: student.companyId,
    });

    return { photo: photoUrl };
  }
}
