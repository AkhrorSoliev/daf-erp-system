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
import { TaskTelegramOutbox } from './telegram/task-telegram-outbox.service';
import { TaskTelegramHandler } from './telegram/task-telegram.handler';

@Module({
  // TelegramModule gives the main bot (`TelegramService.getBot()`). One way
  // only: nothing under src/telegram imports src/tasks (ADR-0078).
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
    TaskTelegramOutbox,
    TaskTelegramHandler,
  ],
  exports: [TasksService],
})
export class TasksModule {}
