import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BranchesModule } from './branches/branches.module';
import { RoomsModule } from './rooms/rooms.module';
import { CoursesModule } from './courses/courses.module';
import { TeachersModule } from './teachers/teachers.module';
import { StudentsModule } from './students/students.module';
import { GroupsModule } from './groups/groups.module';
import { HolidaysModule } from './holidays/holidays.module';
import { CompanyModule } from './company/company.module';
import { UploadModule } from './upload/upload.module';
import { TelegramModule } from './telegram/telegram.module';
import { ArchiveModule } from './archive/archive.module';
import { StatusHistoryModule } from './common/status';
import { EntityHistoryModule } from './common/entity-history';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SmsModule } from './sms/sms.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AiModule } from './ai/ai.module';
import { JwtAuthGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    AiModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    RoomsModule,
    CoursesModule,
    TeachersModule,
    StudentsModule,
    GroupsModule,
    HolidaysModule,
    CompanyModule,
    UploadModule,
    TelegramModule,
    ArchiveModule,
    StatusHistoryModule,
    EntityHistoryModule,
    CommentsModule,
    NotificationsModule,
    SmsModule,
    AttendanceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
