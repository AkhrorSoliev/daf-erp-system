import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { ApproveJoinRequestDto } from './dto/approve-join-request.dto';
import { RejectJoinRequestDto } from './dto/reject-join-request.dto';
import { JoinRequestDecisionsService } from './join-request-decisions.service';

/**
 * Join requests (ADR-0080). Each route checks the caller against the
 * request's branch (`assertCallerInBranch`), not the header.
 */
@Controller('student-join-requests')
export class StudentJoinRequestsController {
  constructor(private readonly decisions: JoinRequestDecisionsService) {}

  @Get('by-task/:taskId')
  @Can('students.enroll')
  byTask(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.decisions.getByTask(taskId, {
      id: userId,
      companyId,
      roles,
    });
  }

  @Post(':id/approve')
  @Can('students.enroll')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveJoinRequestDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.decisions.approve(id, dto.groupId, {
      id: userId,
      companyId,
      roles,
    });
  }

  @Post(':id/reject')
  @Can('students.enroll')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectJoinRequestDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.decisions.reject(id, dto.reason, {
      id: userId,
      companyId,
      roles,
    });
  }
}
