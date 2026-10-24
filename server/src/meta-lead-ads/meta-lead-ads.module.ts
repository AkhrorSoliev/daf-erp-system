import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { MetaLeadAdsController } from './meta-lead-ads.controller';
import { MetaLeadAdsService } from './meta-lead-ads.service';

@Module({
  imports: [LeadsModule],
  controllers: [MetaLeadAdsController],
  providers: [MetaLeadAdsService],
})
export class MetaLeadAdsModule {}
