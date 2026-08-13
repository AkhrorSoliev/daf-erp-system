import { Global, Module } from '@nestjs/common';
import { DebtAgeService } from './debt-age.service';

/**
 * Global because two unrelated modules need the same answer: the debtors list
 * (`payments`) and the center top-up drill-down (`salary`) both say how long a
 * student has owed and which months it came from. Wiring them through each
 * other's module would tie payroll to payments for one read-only lookup — and
 * a second copy of the service would mean a second daily replay and two
 * answers to one question.
 */
@Global()
@Module({
  providers: [DebtAgeService],
  exports: [DebtAgeService],
})
export class DebtAgeModule {}
