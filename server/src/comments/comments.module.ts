import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentEventsListener } from './comment-events.listener';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService, CommentEventsListener],
  exports: [CommentsService],
})
export class CommentsModule {}
