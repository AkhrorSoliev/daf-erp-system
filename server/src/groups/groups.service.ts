import { Injectable } from '@nestjs/common';
import { GroupQueryDto } from './dto/group-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { GroupsReadService } from './groups-read.service';
import { GroupsWriteService } from './groups-write.service';
import { GroupsStatusService } from './groups-status.service';

@Injectable()
export class GroupsService {
  constructor(
    private read: GroupsReadService,
    private write: GroupsWriteService,
    private statusService: GroupsStatusService,
  ) {}

  // Reads
  findAll(query: GroupQueryDto, companyId: number) {
    return this.read.findAll(query, companyId);
  }
  getNextName(branchId: number, companyId: number) {
    return this.read.getNextName(branchId, companyId);
  }
  findStudentsByGroupId(groupId: string, companyId: number) {
    return this.read.findStudentsByGroupId(groupId, companyId);
  }
  findOne(id: string, companyId: number) {
    return this.read.findOne(id, companyId);
  }
  getStatusHistory(id: string, companyId: number) {
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
