import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { LeadsModule } from '../leads/leads.module';
import { CustomFormsController } from './custom-forms.controller';
import { CustomFormsPublicController } from './custom-forms-public.controller';
import { CustomFormsService } from './custom-forms.service';

@Module({
  imports: [
    LeadsModule,
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 600_000, limit: 30 },
    ]),
  ],
  controllers: [CustomFormsController, CustomFormsPublicController],
  providers: [CustomFormsService],
})
export class CustomFormsModule {}
