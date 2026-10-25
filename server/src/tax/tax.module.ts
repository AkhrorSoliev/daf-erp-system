import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TaxSettingsService } from './tax-settings.service';
import { TaxSettingsController } from './tax-settings.controller';

@Module({
  imports: [SettingsModule],
  controllers: [TaxSettingsController],
  providers: [TaxSettingsService],
  exports: [TaxSettingsService],
})
export class TaxModule {}
