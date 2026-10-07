import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskNotifyListener } from './task-notify.listener';
import { TaskOutboxService } from './task-outbox.service';
import { TaskUserLifecycleListener } from './task-user-lifecycle.listener';

@Module({
  imports: [NotificationsModule, HolidaysModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksReadService,
    TaskNotifyListener,
    TaskOutboxService,
    TaskUserLifecycleListener,
  ],
  exports: [TasksService],
})
export class TasksModule {}
