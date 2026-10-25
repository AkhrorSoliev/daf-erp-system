import { BadRequestException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import { birthDateProblem } from './student-onboarding';

export interface ProfileTarget {
  id: number;
  gender: Gender | null;
  dateOfBirth: Date | null;
  companyId: number;
  userId: number | null;
}

export interface ProfileInput {
  gender?: Gender;
  /** 'YYYY-MM-DD' */
  dateOfBirth?: string;
}

export type ProfileWritten = ProfileInput;

export interface FillProfileDeps {
  prisma: Pick<PrismaService, 'student' | 'user'>;
  entityHistory: Pick<EntityHistoryService, 'recordUpdate'>;
}

/**
 * Jins va tug'ilgan sanani kartaga yozadi — faqat hali bo'sh bo'lganini.
 * Xodim kiritgani ustun turadi: bu eshik birinchi marta to'ldirish uchun,
 * kartaning ikkinchi tahrirlagichi emas. Ilova eshigi (ADR-0039) ham, Telegram
 * so'rovi ham shu yerdan o'tadi. Nima yozilganini qaytaradi (`{}` = hech narsa).
 */
export async function fillStudentProfile(
  deps: FillProfileDeps,
  student: ProfileTarget,
  input: ProfileInput,
  actorUserId?: number,
): Promise<ProfileWritten> {
  const data: { gender?: Gender; dateOfBirth?: Date } = {};
  const written: ProfileWritten = {};

  if (input.gender && !student.gender) {
    data.gender = input.gender;
    written.gender = input.gender;
  }
  if (input.dateOfBirth && !student.dateOfBirth) {
    const problem = birthDateProblem(input.dateOfBirth);
    if (problem) throw new BadRequestException(problem);
    data.dateOfBirth = utcMidnightFromDateStr(input.dateOfBirth);
    written.dateOfBirth = input.dateOfBirth;
  }
  if (Object.keys(data).length === 0) return {};

  await deps.prisma.student.update({ where: { id: student.id }, data });
  if (data.gender && student.userId) {
    // Hisob kartadagi jinsni aks ettiradi (`User.gender`).
    await deps.prisma.user.update({
      where: { id: student.userId },
      data: { gender: data.gender },
    });
  }

  await deps.entityHistory.recordUpdate({
    entityType: 'Student',
    entityId: student.id,
    oldValues: {
      ...(written.gender && { gender: null }),
      ...(written.dateOfBirth && { dateOfBirth: null }),
    },
    newValues: {
      ...(written.gender && { gender: written.gender }),
      ...(written.dateOfBirth && { dateOfBirth: written.dateOfBirth }),
    },
    changedById: actorUserId,
    companyId: student.companyId,
  });

  return written;
}
