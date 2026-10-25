import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { WebsiteLeadsController } from './website-leads.controller';
import { WebsiteLeadsService } from './website-leads.service';

@Module({
  imports: [LeadsModule],
  controllers: [WebsiteLeadsController],
  providers: [WebsiteLeadsService],
})
export class WebsiteLeadsModule {}
