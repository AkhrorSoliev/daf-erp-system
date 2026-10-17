import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ParticipationCertificatesController } from './participation-certificates.controller';
import { ParticipationCertificatesService } from './participation-certificates.service';
import { ParticipationFactsService } from './participation-facts.service';
import { ParticipationSettingsService } from './participation-settings.service';
import { StudentCertificatesController } from './student-certificates.controller';

/** Teilnahmebestätigung (spec 2026-10-17, ADR in this PR). */
@Module({
  imports: [SettingsModule],
  controllers: [
    StudentCertificatesController,
    ParticipationCertificatesController,
  ],
  providers: [
    ParticipationFactsService,
    ParticipationSettingsService,
    ParticipationCertificatesService,
  ],
})
export class ParticipationCertificatesModule {}
