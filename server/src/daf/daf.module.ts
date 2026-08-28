import { Module } from '@nestjs/common';
import { DafPortalController } from './daf-portal.controller';
import { DafPortalReadService } from './daf-portal-read.service';
import { DafAttemptService } from './daf-attempt.service';
import { DafSeedService } from './seed/daf-seed.service';
import { DafDrillService } from './lesson/daf-drill.service';

@Module({
  controllers: [DafPortalController],
  providers: [
    DafPortalReadService,
    DafAttemptService,
    DafDrillService,
    DafSeedService,
  ],
  exports: [DafSeedService],
})
export class DafModule {}
