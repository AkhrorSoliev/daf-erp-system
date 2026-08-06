import { Injectable } from '@nestjs/common';
import { GroupQueryDto } from './dto/group-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { GroupsReadService } from './groups-read.service';
import { GroupsWriteService } from './groups-write.service';
import { GroupsStatusService } from './groups-status.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';

@Injectable()
export class GroupsService {
  constructor(
    private read: GroupsReadService,
    private write: GroupsWriteService,
    private statusService: GroupsStatusService,
    // Holds the caller-branch check on the two id-addressed reads below.
    private prisma: PrismaService,
  ) {}

  // Reads
  findAll(
    query: GroupQueryDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    return this.read.findAll(query, companyId, scope);
  }
  getNextName(branchId: number, companyId: number) {
    return this.read.getNextName(branchId, companyId);
  }
  /**
   * The roster: name, phone and BALANCE for every active student in a group.
   *
   * `@Roles` here includes Teacher, and it was the only check — so any teacher
   * could read any group in the company by id, including groups in a branch
   * they have never worked in and do not appear in. `findAll` was scoped;
   * this, the thing the list links to, was not.
   *
   * `assertCallerMayTouchGroup` is the right gate precisely because it is not
   * a branch check for everybody: a teacher is held to GROUP ASSIGNMENT, which
   * is stricter than branch and is what stops one teacher reading a
   * colleague's register down the hall. Admins and directors are held to the
   * branch, because working across their branch's groups is their job.
   */
  async findStudentsByGroupId(
    groupId: string,
    companyId: number,
    userId?: number,
    roles: string[] = [],
  ) {
    await assertCallerMayTouchGroup(
      this.prisma,
      userId as number,
      roles,
      groupId,
      "Bu guruh boshqa filialga tegishli — ro'yxatini ko'rish huquqingiz yo'q",
    );
    return this.read.findStudentsByGroupId(groupId, companyId);
  }
  findOne(id: string, companyId: number, scope: ReportBranchIds) {
    return this.read.findOne(id, companyId, scope);
  }
  async getStatusHistory(
    id: string,
    companyId: number,
    userId?: number,
    roles: string[] = [],
  ) {
    await assertCallerMayTouchGroup(
      this.prisma,
      userId as number,
      roles,
      id,
      "Bu guruh boshqa filialga tegishli — tarixini ko'rish huquqingiz yo'q",
    );
    return this.read.getStatusHistory(id, companyId);
  }

  // Writes
  create(dto: CreateGroupDto, companyId: number, userId?: number) {
    return this.write.create(dto, companyId, userId);
  }
  update(
    id: string,
    dto: UpdateGroupDto,
    userId: number | undefined,
    companyId: number,
  ) {
    return this.write.update(id, dto, userId, companyId);
  }
  delete(id: string, userId: number, companyId: number) {
    return this.write.delete(id, userId, companyId);
  }

  // Status
  changeStatus(
    id: string,
    dto: ChangeGroupStatusDto,
    userId: number,
    companyId: number,
  ) {
    return this.statusService.changeStatus(id, dto, userId, companyId);
  }
}
