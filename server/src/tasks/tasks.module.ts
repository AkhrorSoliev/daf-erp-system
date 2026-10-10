import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskNotifyListener } from './task-notify.listener';
import { TaskOutboxService } from './task-outbox.service';
import { TaskUserLifecycleListener } from './task-user-lifecycle.listener';
import { TaskTelegramSender } from './telegram/task-telegram.sender';
import { TaskTelegramListener } from './telegram/task-telegram.listener';

@Module({
  // TelegramModule gives the main bot (`TelegramService.getBot()`). One way
  // only: nothing under src/telegram imports src/tasks (ADR-0077).
  imports: [NotificationsModule, HolidaysModule, TelegramModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksReadService,
    TaskNotifyListener,
    TaskOutboxService,
    TaskUserLifecycleListener,
    TaskTelegramSender,
    TaskTelegramListener,
  ],
  exports: [TasksService],
})
export class TasksModule {}
