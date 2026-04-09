import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentEventsListener } from './comment-events.listener';
import { TaskReminderService } from './task-reminder.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentEventsListener, TaskReminderService],
  exports: [CommentsService],
})
export class CommentsModule {}
