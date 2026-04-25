import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveDeleteService } from './archive-delete.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
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
