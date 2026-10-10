import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { BalanceNoticesController } from './balance-notices.controller';
import { BalanceNoticesService } from './balance-notices.service';

@Module({
  imports: [SmsModule],
  controllers: [BalanceNoticesController],
  providers: [BalanceNoticesService],
})
export class BalanceNoticesModule {}
