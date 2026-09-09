import { Module } from '@nestjs/common';
import { DafMediaController } from './daf-media.controller';
import { DafMediaOverviewService } from './media/daf-media-overview.service';
import { DafMediaCoverageService } from './media/daf-media-coverage.service';
import { DafMediaInhaltService } from './media/daf-media-inhalt.service';
import { DafMediaFragenService } from './media/daf-media-fragen.service';
import { DafPortalController } from './daf-portal.controller';
import { DafPortalReadService } from './daf-portal-read.service';
import { DafAttemptService } from './daf-attempt.service';
import { DafSeedService } from './seed/daf-seed.service';
import { DafDrillService } from './lesson/daf-drill.service';
import { KursSeedService } from './kurs/kurs-seed.service';
import { InhaltSeedService } from './inhalt/inhalt-seed.service';
import { UebungService } from './uebung/uebung.service';
import { FortschrittService } from './fortschritt/fortschritt.service';

@Module({
  controllers: [DafPortalController, DafMediaController],
  providers: [
    DafPortalReadService,
    DafAttemptService,
    DafDrillService,
    DafSeedService,
    DafMediaOverviewService,
    DafMediaCoverageService,
    DafMediaInhaltService,
    DafMediaFragenService,
    KursSeedService,
    InhaltSeedService,
    UebungService,
    FortschrittService,
  ],
  exports: [DafSeedService],
})
export class DafModule {}
