import { equalsOrIn } from '../../common/dto/to-array';

export function buildDepartedEnrollmentWhere(
  companyId: number,
  params: {
    branchId?: number;
    courseId?: string[];
    teacherIds?: number[];
  },
): any {
  const groupFilter: any = {};
  if (params.branchId !== undefined) groupFilter.branchId = params.branchId;
  if (params.courseId?.length)
    groupFilter.courseId = equalsOrIn(params.courseId);
  if (params.teacherIds && params.teacherIds.length > 0) {
    groupFilter.teachers = {
      some: { teacherId: { in: params.teacherIds } },
    };
  }
  const where: any = {
    deletedAt: null,
    student: { companyId, deletedAt: null },
  };
  if (Object.keys(groupFilter).length > 0) {
    where.group = groupFilter;
  }
  return where;
}
