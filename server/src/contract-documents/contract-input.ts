import { BadRequestException } from '@nestjs/common';
import { isCalendarDateStr } from '../common/date/tashkent';
import type { ContractCourseExtras } from './contract-fields';
import type { ContractCourseExtrasDto } from './dto/contract-document.dto';

/** The DTO checks the shape; this refuses a day the calendar does not have (2026-02-30). */
export function assertDay(value: string | undefined): void {
  if (value !== undefined && !isCalendarDateStr(value)) {
    throw new BadRequestException(`Sana noto'g'ri: ${value}`);
  }
}

export function assertCourseExtras(
  courses: ContractCourseExtrasDto[] | undefined,
): void {
  for (const c of courses ?? []) {
    assertDay(c.firstPaymentDate);
    assertDay(c.discountFrom);
    assertDay(c.discountTo);
    if (c.discountFrom && c.discountTo && c.discountFrom > c.discountTo) {
      throw new BadRequestException(
        "Chegirma muddatining oxiri boshidan oldin bo'lishi mumkin emas",
      );
    }
  }
}

export function extrasOf(
  dto: ContractCourseExtrasDto | undefined,
): Partial<ContractCourseExtras> {
  if (!dto) return {};
  return {
    firstPaymentAmount: dto.firstPaymentAmount,
    firstPaymentDate: dto.firstPaymentDate,
    discountReason: dto.discountReason,
    discountFrom: dto.discountFrom,
    discountTo: dto.discountTo,
    includes: dto.includes,
  };
}
