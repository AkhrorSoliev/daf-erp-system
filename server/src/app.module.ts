import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DebtAgeModule } from './common/finance/debt-age.module';
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
import { SalaryModule } from './salary/salary.module';
import { RefundsModule } from './refunds/refunds.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CashAccountsModule } from './cash-accounts/cash-accounts.module';
import { PaymentGatewaysModule } from './payment-gateways/payment-gateways.module';
import { LessonCancellationsModule } from './lesson-cancellations/lesson-cancellations.module';
import { LessonTeacherOverridesModule } from './lesson-teacher-overrides/lesson-teacher-overrides.module';
import { LessonReschedulesModule } from './lesson-reschedules/lesson-reschedules.module';
import { BillingModule } from './billing/billing.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { OutreachModule } from './outreach/outreach.module';
import { PlannedAbsencesModule } from './planned-absences/planned-absences.module';
import { PaymentPromisesModule } from './payment-promises/payment-promises.module';
import { CallLogsModule } from './call-logs/call-logs.module';
import { JwtAuthGuard, BranchScopeGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Crons are ON unless explicitly switched off. The default has to be "on"
    // because production sets no such variable — a flag that defaults to off
    // would silently stop payroll, the nightly snapshot and every reminder.
    //
    // `CRONS_ENABLED=false` exists for one case: pointing a LOCAL server at the
    // production database to look at a real page. Without it, that laptop runs
    // the schedule too — attendance reminders go out to real teachers every 30
    // minutes, the 23:40 snapshot is written, and the 02:00 payroll fires.
    ...(process.env.CRONS_ENABLED === 'false' ? [] : [ScheduleModule.forRoot()]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    DebtAgeModule,
    RedisModule,
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
    SalaryModule,
    RefundsModule,
    WithdrawalsModule,
    ExpensesModule,
    CashAccountsModule,
    PaymentGatewaysModule,
    BillingModule,
    LessonCancellationsModule,
    LessonTeacherOverridesModule,
    LessonReschedulesModule,
    ReceiptsModule,
    OutreachModule,
    PlannedAbsencesModule,
    PaymentPromisesModule,
    CallLogsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Runs after JwtAuthGuard (APP_GUARD order is registration order), so
    // `request.user` is populated by the time it resolves the scope. It only
    // COMPUTES `request.branchScope` — it never rejects — so an endpoint that
    // has not opted in keeps its current behaviour.
    {
      provide: APP_GUARD,
      useClass: BranchScopeGuard,
    },
  ],
})
export class AppModule {}
