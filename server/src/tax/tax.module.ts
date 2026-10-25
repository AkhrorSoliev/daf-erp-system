import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TaxSettingsService } from './tax-settings.service';
import { TaxSettingsController } from './tax-settings.controller';
import { TaxCostsService } from './tax-costs.service';

@Module({
  imports: [SettingsModule],
  controllers: [TaxSettingsController],
  providers: [TaxSettingsService, TaxCostsService],
  exports: [TaxSettingsService, TaxCostsService],
})
export class TaxModule {}
