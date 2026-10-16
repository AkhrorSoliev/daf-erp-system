import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskRecurrencesService } from './task-recurrences.service';
import { TaskRecurrenceRunner } from './task-recurrence-run.service';
import { TaskAutoCloseListener } from './task-auto-close.listener';
import { TaskAutoLeadsService } from './task-auto-leads.service';
import { TaskAutoService } from './task-auto.service';
import { TaskNotifyListener } from './task-notify.listener';
import { TaskFileStorage } from './task-file-storage';
import { TaskFilesService } from './task-files.service';
import { TaskOutboxService } from './task-outbox.service';
import { TaskUserLifecycleListener } from './task-user-lifecycle.listener';
import { TaskTelegramSender } from './telegram/task-telegram.sender';
import { TaskTelegramListener } from './telegram/task-telegram.listener';
import { TaskTelegramLive } from './telegram/task-telegram-live';
import { TaskTelegramOutbox } from './telegram/task-telegram-outbox.service';
import { TaskTelegramReplies } from './telegram/task-telegram-replies';
import { TaskTelegramHandler } from './telegram/task-telegram.handler';

@Module({
  // TelegramModule gives the main bot (`TelegramService.getBot()`). One way
  // only: nothing under src/telegram imports src/tasks (ADR-0078).
  imports: [NotificationsModule, HolidaysModule, TelegramModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksReadService,
    TaskRecurrencesService,
    TaskRecurrenceRunner,
    TaskFileStorage,
    TaskFilesService,
    TaskNotifyListener,
    TaskAutoCloseListener,
    TaskAutoService,
    TaskAutoLeadsService,
    TaskOutboxService,
    TaskUserLifecycleListener,
    TaskTelegramSender,
    TaskTelegramLive,
    TaskTelegramListener,
    TaskTelegramOutbox,
    TaskTelegramReplies,
    TaskTelegramHandler,
  ],
  exports: [TasksService],
})
export class TasksModule {}
