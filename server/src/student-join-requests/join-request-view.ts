import type {
  LeadStatus,
  PrismaClient,
  StudentJoinRequest,
  StudentJoinRequestStatus,
} from '@prisma/client';
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';

type Db = Pick<
  PrismaClient,
  'group' | 'enrollment' | 'lead' | 'student' | 'user'
>;

/** What the «So'rov» block of the task sheet reads (spec §5.3). */
export interface JoinRequestView {
  id: string;
  status: StudentJoinRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
  rejectReason: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  telegramUsername: string | null;
  requestedGroup: { id: string; name: string } | null;
  approvedGroup: { id: string; name: string } | null;
  studentId: number | null;
  decidedBy: { id: number; firstName: string; lastName: string } | null;
  /** The branch's groups that take students: what «Guruh» offers. */
  groups: { id: string; name: string; teacherName: string | null }[];
  /** Groups where an active student already has this first and last name. */
  sameNameGroupIds: string[];
  /** The latest lead with this phone (main or extra number). */
  lead: {
    createdAt: Date;
    status: LeadStatus;
    archived: boolean;
    sourceName: string | null;
  } | null;
  /** An archived card with this phone: restoring it may be right. */
  archivedStudentId: number | null;
}

export async function loadJoinRequestView(
  db: Db,
  r: StudentJoinRequest,
): Promise<JoinRequestView> {
  const named = [r.groupId, ...(r.approvedGroupId ? [r.approvedGroupId] : [])];
  const [groups, sameName, lead, archived, decidedBy] = await Promise.all([
    db.group.findMany({
      where: {
        OR: [{ id: { in: named } }, { branchId: r.branchId, deletedAt: null }],
      },
      select: {
        id: true,
        name: true,
        branchId: true,
        deletedAt: true,
        statusEnum: true,
        teachers: {
          select: { teacher: { select: { firstName: true, lastName: true } } },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    }),
    db.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        group: { branchId: r.branchId, deletedAt: null },
        student: {
          deletedAt: null,
          firstName: { equals: r.firstName, mode: 'insensitive' },
          lastName: { equals: r.lastName, mode: 'insensitive' },
        },
      },
      select: { groupId: true },
    }),
    db.lead.findFirst({
      where: {
        companyId: r.companyId,
        OR: [{ phone: r.phone }, { extraPhone: r.phone }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        statusEnum: true,
        deletedAt: true,
        source: { select: { name: true } },
      },
    }),
    db.student.findFirst({
      where: {
        companyId: r.companyId,
        phone: r.phone,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: 'desc' },
      select: { id: true },
    }),
    r.decidedById
      ? db.user.findUnique({
          where: { id: r.decidedById },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve(null),
  ]);

  const byId = new Map(groups.map((g) => [g.id, g]));
  const nameOf = (id: string | null) => {
    const g = id ? byId.get(id) : undefined;
    return g ? { id: g.id, name: g.name } : null;
  };
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    rejectReason: r.rejectReason,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    photo: r.photo,
    telegramUsername: r.telegramUsername,
    requestedGroup: nameOf(r.groupId),
    approvedGroup: nameOf(r.approvedGroupId),
    studentId: r.studentId,
    decidedBy,
    groups: groups
      .filter(
        (g) =>
          g.branchId === r.branchId &&
          g.deletedAt === null &&
          isEnrollableGroupStatus(g.statusEnum),
      )
      .map((g) => {
        const t = g.teachers[0]?.teacher;
        return {
          id: g.id,
          name: g.name,
          teacherName: t ? `${t.firstName} ${t.lastName}` : null,
        };
      }),
    sameNameGroupIds: [...new Set(sameName.map((e) => e.groupId))],
    lead: lead
      ? {
          createdAt: lead.createdAt,
          status: lead.statusEnum,
          archived: lead.deletedAt !== null,
          sourceName: lead.source?.name ?? null,
        }
      : null,
    archivedStudentId: archived?.id ?? null,
  };
}
