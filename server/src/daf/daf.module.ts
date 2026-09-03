import { Module } from '@nestjs/common';
import { DafMediaController } from './daf-media.controller';
import { DafMediaOverviewService } from './media/daf-media-overview.service';
import { DafPortalController } from './daf-portal.controller';
import { DafPortalReadService } from './daf-portal-read.service';
import { DafAttemptService } from './daf-attempt.service';
import { DafSeedService } from './seed/daf-seed.service';
import { DafDrillService } from './lesson/daf-drill.service';

@Module({
  controllers: [DafPortalController, DafMediaController],
  providers: [
    DafPortalReadService,
    DafAttemptService,
    DafDrillService,
    DafSeedService,
    DafMediaOverviewService,
  ],
  exports: [DafSeedService],
})
export class DafModule {}
