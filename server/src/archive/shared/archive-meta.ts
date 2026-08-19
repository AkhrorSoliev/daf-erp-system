import { BadRequestException } from '@nestjs/common';
import {
  UserStatus,
  StudentStatus,
  GroupStatus,
  CourseStatus,
  BranchStatus,
  RoomStatus,
  LeadStatus,
  EnrollmentStatus,
  HolidayStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ArchiveEntityType } from '../dto/archive-query.dto';

export const ENTITY_DEFAULT_STATUS: Record<string, string> = {
  [ArchiveEntityType.USERS]: UserStatus.ACTIVE,
  [ArchiveEntityType.STUDENTS]: StudentStatus.ACTIVE,
  [ArchiveEntityType.GROUPS]: GroupStatus.FORMING,
  [ArchiveEntityType.COURSES]: CourseStatus.ACTIVE,
  [ArchiveEntityType.BRANCHES]: BranchStatus.ACTIVE,
  [ArchiveEntityType.ROOMS]: RoomStatus.ACTIVE,
  [ArchiveEntityType.LEADS]: LeadStatus.NEW,
  [ArchiveEntityType.ENROLLMENTS]: EnrollmentStatus.ACTIVE,
  [ArchiveEntityType.HOLIDAYS]: HolidayStatus.ACTIVE,
};

export const ENTITY_TYPE_MAP: Record<string, string> = {
  [ArchiveEntityType.USERS]: 'User',
  [ArchiveEntityType.STUDENTS]: 'Student',
  [ArchiveEntityType.GROUPS]: 'Group',
  [ArchiveEntityType.COURSES]: 'Course',
  [ArchiveEntityType.BRANCHES]: 'Branch',
  [ArchiveEntityType.ROOMS]: 'Room',
  [ArchiveEntityType.LEADS]: 'Lead',
  [ArchiveEntityType.ENROLLMENTS]: 'Enrollment',
  [ArchiveEntityType.HOLIDAYS]: 'Holiday',
};

/**
 * Entity types whose Prisma model has a `companyId` column — we filter by it
 * to keep archive views strictly multi-tenant. Lead/Holiday are schema-global
 * today (no companyId) and are intentionally omitted.
 */
export const COMPANY_SCOPED_ENTITIES = new Set<string>([
  ArchiveEntityType.USERS,
  ArchiveEntityType.STUDENTS,
  ArchiveEntityType.GROUPS,
  ArchiveEntityType.COURSES,
  ArchiveEntityType.BRANCHES,
  ArchiveEntityType.ROOMS,
  // Enrollment/Lead/Holiday do not carry companyId in the current schema.
]);

export function companyScope(
  entityType: ArchiveEntityType,
  companyId: number,
): Record<string, number> {
  return COMPANY_SCOPED_ENTITIES.has(entityType) ? { companyId } : {};
}

export function getDelegate(
  prisma: PrismaService,
  entityType: ArchiveEntityType,
) {
  const map: Record<ArchiveEntityType, any> = {
    [ArchiveEntityType.USERS]: prisma.user,
    [ArchiveEntityType.BRANCHES]: prisma.branch,
    [ArchiveEntityType.ROOMS]: prisma.room,
    [ArchiveEntityType.COURSES]: prisma.course,
    [ArchiveEntityType.STUDENTS]: prisma.student,
    [ArchiveEntityType.LEADS]: prisma.lead,
    [ArchiveEntityType.GROUPS]: prisma.group,
    [ArchiveEntityType.ENROLLMENTS]: prisma.enrollment,
    [ArchiveEntityType.HOLIDAYS]: prisma.holiday,
  };
  return map[entityType];
}

export function getInclude(entityType: ArchiveEntityType) {
  const map: Partial<Record<ArchiveEntityType, any>> = {
    [ArchiveEntityType.USERS]: {
      roles: { include: { role: true } },
      branches: { include: { branch: { select: { id: true, name: true } } } },
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.BRANCHES]: {
      company: { select: { id: true, name: true } },
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.GROUPS]: {
      course: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.STUDENTS]: {
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.LEADS]: {
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.COURSES]: {
      company: { select: { id: true, name: true } },
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.ROOMS]: {
      branch: { select: { id: true, name: true } },
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    [ArchiveEntityType.ENROLLMENTS]: {
      student: { select: { id: true, firstName: true, lastName: true } },
      group: { select: { id: true, name: true } },
      deletedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  };
  return map[entityType] || null;
}

export function getSearchFilter(entityType: ArchiveEntityType, search: string) {
  switch (entityType) {
    // `User` has no `name` column — only firstName/lastName. Filtering on
    // `name` threw a Prisma validation error on every staff archive search.
    case ArchiveEntityType.USERS:
      return {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    case ArchiveEntityType.BRANCHES:
      return { name: { contains: search, mode: 'insensitive' } };
    case ArchiveEntityType.COURSES:
      return { name: { contains: search, mode: 'insensitive' } };
    case ArchiveEntityType.STUDENTS:
      return {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    case ArchiveEntityType.LEADS:
      return {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    case ArchiveEntityType.GROUPS:
      return { name: { contains: search, mode: 'insensitive' } };
    case ArchiveEntityType.ROOMS:
      return { name: { contains: search, mode: 'insensitive' } };
    default:
      return {};
  }
}

export function getStatusField(entityType: ArchiveEntityType): string {
  if (entityType === ArchiveEntityType.GROUPS) return 'statusEnum';
  if (entityType === ArchiveEntityType.LEADS) return 'statusEnum';
  return 'status';
}

export function parseId(entityType: ArchiveEntityType, id: string | number) {
  // User, Branch va Student int ID ishlatadi
  if (
    entityType === ArchiveEntityType.USERS ||
    entityType === ArchiveEntityType.BRANCHES ||
    entityType === ArchiveEntityType.STUDENTS
  ) {
    const parsed = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException(`Noto'g'ri ID: ${id}`);
    }
    return parsed;
  }
  // Qolgan entitylar UUID ishlatadi
  return String(id);
}
