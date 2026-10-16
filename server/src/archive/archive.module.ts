import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveDeleteService } from './archive-delete.service';
import { UploadModule } from '../upload/upload.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  // LeadsModule: a restored lead's owner is released through
  // LeadOwnershipService (ADR-0092). Nothing in LeadsModule's imports imports
  // ArchiveModule, so there is no cycle.
  imports: [UploadModule, LeadsModule],
  controllers: [ArchiveController],
  providers: [
    ArchiveService,
    ArchiveReadService,
    ArchiveRestoreService,
    ArchiveDeleteService,
  ],
  exports: [ArchiveService],
})
export class ArchiveModule {}
