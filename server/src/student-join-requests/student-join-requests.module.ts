import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { JoinRequestDecisionsService } from './join-request-decisions.service';
import { StudentJoinRequestsController } from './student-join-requests.controller';
import { StudentJoinRequestsService } from './student-join-requests.service';

/**
 * Join requests (ADR-0080). Must not import `TelegramModule`: TelegramModule
 * imports this one for its scene, and messages to the person go out through
 * the `JOIN_REQUEST_MESSAGE` event instead.
 */
@Module({
  imports: [UploadModule],
  controllers: [StudentJoinRequestsController],
  providers: [StudentJoinRequestsService, JoinRequestDecisionsService],
  exports: [StudentJoinRequestsService, JoinRequestDecisionsService],
})
export class StudentJoinRequestsModule {}
