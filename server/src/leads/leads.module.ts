import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { SettingsModule } from '../settings/settings.module';
import { LeadsController } from './leads.controller';
import { LeadColumnsController } from './lead-columns.controller';
import { LeadSectionsController } from './lead-sections.controller';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadsService } from './leads.service';
import { LeadsBoardService } from './leads-board.service';
import { LeadsArchiveService } from './leads-archive.service';
import { LeadsStatsService } from './leads-stats.service';
import { LeadColumnsService } from './lead-columns.service';
import { LeadSectionsService } from './lead-sections.service';
import { LeadSourcesService } from './lead-sources.service';
import { LeadOwnershipService } from './ownership/lead-ownership.service';

@Module({
  imports: [StudentsModule, SettingsModule],
  controllers: [
    LeadsController,
    LeadColumnsController,
    LeadSectionsController,
    LeadSourcesController,
  ],
  providers: [
    LeadsService,
    LeadsBoardService,
    LeadsArchiveService,
    LeadsStatsService,
    LeadColumnsService,
    LeadSectionsService,
    LeadSourcesService,
    LeadOwnershipService,
  ],
  exports: [LeadsService, LeadOwnershipService],
})
export class LeadsModule {}
