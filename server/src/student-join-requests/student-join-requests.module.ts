import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { StudentJoinRequestsService } from './student-join-requests.service';

/**
 * Join requests (ADR-0080). Must not import `TelegramModule`: TelegramModule
 * imports this one for its scene, and messages to the person go out through
 * the `JOIN_REQUEST_MESSAGE` event instead.
 */
@Module({
  imports: [UploadModule],
  providers: [StudentJoinRequestsService],
  exports: [StudentJoinRequestsService],
})
export class StudentJoinRequestsModule {}
