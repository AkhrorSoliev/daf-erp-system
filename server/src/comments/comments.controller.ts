import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentQueryDto,
  LatestCommentQueryDto,
} from './dto/comment-query.dto';
import { Can } from '../common/permissions/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  @Can('comments.write')
  create(
    @Body() dto: CreateCommentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.commentsService.create(dto, userId, companyId, roles);
  }

  @Get()
  @Can(
    'comments.write',
    'students.details',
    'groups.manage',
    'teachers.view',
    'employees.view',
  )
  findByEntity(
    @Query() query: CommentQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.commentsService.findByEntity(query, companyId, userId, roles);
  }

  @Get('latest')
  @Can(
    'comments.write',
    'students.details',
    'groups.manage',
    'teachers.view',
    'employees.view',
  )
  getLatestComment(
    @Query() query: LatestCommentQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.commentsService.getLatestComment(
      query,
      companyId,
      userId,
      roles,
    );
  }

  @Patch(':id')
  @Can('comments.write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.commentsService.update(id, dto, userId, companyId);
  }

  @Delete(':id')
  @Can('comments.delete')
  delete(@Param('id') id: string, @CurrentUser('companyId') companyId: number) {
    // The `comments.delete` marker already restricts who can reach here
    return this.commentsService.delete(id, companyId);
  }
}
