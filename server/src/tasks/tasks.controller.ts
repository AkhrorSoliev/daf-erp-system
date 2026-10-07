import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, STAFF_ROLES } from '../common/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards';
import { TasksService, type TaskActor } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { TaskStatusDto } from './dto/task-status.dto';
import { TaskReviewDto } from './dto/task-review.dto';
import { TaskCancelDto } from './dto/task-cancel.dto';
import { TaskParticipantsDto } from './dto/task-participants.dto';
import { CreateStepDto, UpdateStepDto } from './dto/task-step.dto';
import { CreateTaskEventDto } from './dto/task-event.dto';
import { WorkloadQueryDto } from './dto/workload-query.dto';

@Controller('tasks')
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
export class TasksController {
  constructor(
    private tasks: TasksService,
    private read: TasksReadService,
  ) {}

  pickBranch(header: string | undefined): number | null {
    return header && /^\d+$/.test(header) ? Number(header) : null;
  }

  private actor(
    userId: number,
    companyId: number,
    header?: string,
  ): Promise<TaskActor> {
    return this.tasks.loadActor(userId, companyId, this.pickBranch(header));
  }

  @Get() async list(
    @Query() q: ListTasksDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.read.list(q, await this.actor(uid, cid));
  }
  @Get('counts') async counts(
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.read.counts(await this.actor(uid, cid));
  }
  @Get('workload') async workload(
    @Query() q: WorkloadQueryDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.read.workload(q, await this.actor(uid, cid));
  }
  @Get('assignable') async assignable(
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.read.assignable(await this.actor(uid, cid));
  }
  @Post() async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
    @Headers('x-branch-id') branch?: string,
  ) {
    return this.tasks.create(dto, await this.actor(uid, cid, branch));
  }
  @Get(':id') async detail(
    @Param('id') id: string,
    @Query('before') before: string | undefined,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.read.detail(id, await this.actor(uid, cid), before);
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.update(id, dto, await this.actor(uid, cid));
  }
  @Post(':id/status') async status(
    @Param('id') id: string,
    @Body() dto: TaskStatusDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.changeStatus(id, dto.status, await this.actor(uid, cid));
  }
  @Post(':id/review') async review(
    @Param('id') id: string,
    @Body() dto: TaskReviewDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.review(
      id,
      dto.action,
      dto.reason,
      await this.actor(uid, cid),
    );
  }
  @Post(':id/cancel') async cancel(
    @Param('id') id: string,
    @Body() dto: TaskCancelDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.cancel(id, dto.reason, await this.actor(uid, cid));
  }
  @Post(':id/duplicate') async duplicate(
    @Param('id') id: string,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
    @Headers('x-branch-id') branch?: string,
  ) {
    return this.tasks.duplicate(id, await this.actor(uid, cid, branch));
  }
  @Put(':id/participants') async participants(
    @Param('id') id: string,
    @Body() dto: TaskParticipantsDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.setParticipants(
      id,
      dto.assigneeIds,
      dto.watcherIds ?? [],
      await this.actor(uid, cid),
    );
  }
  @Post(':id/seen') async seen(
    @Param('id') id: string,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    await this.tasks.markSeen(id, await this.actor(uid, cid));
    return { ok: true };
  }
  @Post(':id/steps') async addStep(
    @Param('id') id: string,
    @Body() dto: CreateStepDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.addStep(id, dto.title, await this.actor(uid, cid));
  }
  @Patch(':id/steps/:stepId') async updateStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.updateStep(id, stepId, dto, await this.actor(uid, cid));
  }
  @Delete(':id/steps/:stepId') async deleteStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.deleteStep(id, stepId, await this.actor(uid, cid));
  }
  @Post(':id/events') async comment(
    @Param('id') id: string,
    @Body() dto: CreateTaskEventDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.tasks.addComment(id, dto.text, await this.actor(uid, cid));
  }
}
