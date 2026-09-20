import { Module } from '@nestjs/common';
import { AbsencePauseController } from './absence-pause.controller';
import { AbsencePauseSettingModule } from './absence-pause-setting.module';
import { AbsencePauseNotifyService } from './absence-pause-notify.service';
import { AbsenceAutoPauseCronService } from './absence-auto-pause.cron.service';
import { OutreachModule } from '../outreach/outreach.module';
import { StudentsModule } from '../students/students.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    AbsencePauseSettingModule,
    OutreachModule,
    StudentsModule,
    NotificationsModule,
    TelegramModule,
  ],
  controllers: [AbsencePauseController],
  providers: [AbsencePauseNotifyService, AbsenceAutoPauseCronService],
})
export class AbsencePauseModule {}
