import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentQueryDto,
  LatestCommentQueryDto,
} from './dto/comment-query.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateAssigneeStatusDto } from './dto/update-assignee-status.dto';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateCommentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    // CEO, BD, and Administrator can create task comments. Administrator was
    // added so the "Aloqa markazi" (/outreach) callback flow works for the
    // role that actually runs it day-to-day.
    if (dto.isTask) {
      const canAssign =
        roles.includes('CEO') ||
        roles.includes('Branch Director') ||
        roles.includes('Administrator');
      if (!canAssign) {
        dto.isTask = false;
        dto.assigneeIds = undefined;
      }
    }

    return this.commentsService.create(dto, userId, companyId);
  }

  @Get('my-tasks')
  getMyTasks(@Query() query: TaskQueryDto, @CurrentUser('id') userId: number) {
    return this.commentsService.getMyTasks(userId, query);
  }

  @Get('created-tasks')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  getCreatedTasks(
    @Query() query: TaskQueryDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.commentsService.getCreatedTasks(userId, query);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findByEntity(
    @Query() query: CommentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.commentsService.findByEntity(query, companyId);
  }

  @Get('latest')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getLatestComment(
    @Query() query: LatestCommentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.commentsService.getLatestComment(query, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.commentsService.update(id, dto, userId, roles, companyId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO')
  delete(@Param('id') id: string, @CurrentUser('companyId') companyId: number) {
    // RolesGuard already ensures only CEO can reach here
    return this.commentsService.delete(id, companyId);
  }

  @Patch(':id/assignee-status')
  updateAssigneeStatus(
    @Param('id') commentId: string,
    @Body() dto: UpdateAssigneeStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.commentsService.updateAssigneeStatus(
      commentId,
      userId,
      dto.status,
    );
  }
}
