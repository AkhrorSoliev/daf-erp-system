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
import { TelegramGroupsModule } from './telegram-groups/telegram-groups.module';
import { ArchiveModule } from './archive/archive.module';
import { StatusHistoryModule } from './common/status';
import { EntityHistoryModule } from './common/entity-history';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SmsModule } from './sms/sms.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { StudentExitReasonsModule } from './student-exit-reasons/student-exit-reasons.module';
import { GroupTeacherChangeReasonsModule } from './group-teacher-change-reasons/group-teacher-change-reasons.module';
import { EnrollmentTransferReasonsModule } from './enrollment-transfer-reasons/enrollment-transfer-reasons.module';
import { LeadsModule } from './leads/leads.module';
import { CustomFormsModule } from './custom-forms/custom-forms.module';
import { MockExamsModule } from './mock-exams/mock-exams.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PaymentsModule } from './payments/payments.module';
import { ContractsModule } from './contracts/contracts.module';
import { SalaryModule } from './salary/salary.module';
import { RefundsModule } from './refunds/refunds.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PaymentGatewaysModule } from './payment-gateways/payment-gateways.module';
import { LessonCancellationsModule } from './lesson-cancellations/lesson-cancellations.module';
import { LessonTeacherOverridesModule } from './lesson-teacher-overrides/lesson-teacher-overrides.module';
import { LessonReschedulesModule } from './lesson-reschedules/lesson-reschedules.module';
import { BillingModule } from './billing/billing.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { OutreachModule } from './outreach/outreach.module';
import { PlannedAbsencesModule } from './planned-absences/planned-absences.module';
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
    TelegramGroupsModule,
    ArchiveModule,
    StatusHistoryModule,
    EntityHistoryModule,
    CommentsModule,
    NotificationsModule,
    SmsModule,
    AttendanceModule,
    SearchModule,
    DashboardModule,
    ReportsModule,
    StudentExitReasonsModule,
    GroupTeacherChangeReasonsModule,
    EnrollmentTransferReasonsModule,
    LeadsModule,
    CustomFormsModule,
    MockExamsModule,
    TransactionsModule,
    PaymentsModule,
    ContractsModule,
    SalaryModule,
    RefundsModule,
    WithdrawalsModule,
    ExpensesModule,
    PaymentGatewaysModule,
    BillingModule,
    LessonCancellationsModule,
    LessonTeacherOverridesModule,
    LessonReschedulesModule,
    ReceiptsModule,
    OutreachModule,
    PlannedAbsencesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
