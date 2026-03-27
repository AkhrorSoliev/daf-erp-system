import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { LeadsModule } from './leads/leads.module';
import { GroupsModule } from './groups/groups.module';
import { EmployeesModule } from './employees/employees.module';
import { HolidaysModule } from './holidays/holidays.module';
import { CompanyModule } from './company/company.module';
import { UploadModule } from './upload/upload.module';
import { TelegramModule } from './telegram/telegram.module';
import { ArchiveModule } from './archive/archive.module';
import { JwtAuthGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    RoomsModule,
    CoursesModule,
    TeachersModule,
    StudentsModule,
    LeadsModule,
    GroupsModule,
    EmployeesModule,
    HolidaysModule,
    CompanyModule,
    UploadModule,
    TelegramModule,
    ArchiveModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
