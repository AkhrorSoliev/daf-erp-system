import { BadRequestException } from '@nestjs/common';
import { SalaryType } from '@prisma/client';
import { assertPercentageWithinCap } from './percentage-cap';

describe('assertPercentageWithinCap', () => {
  it('allows a PERCENTAGE rate at or below 100', () => {
    expect(() =>
      assertPercentageWithinCap(SalaryType.PERCENTAGE, 100),
    ).not.toThrow();
    expect(() =>
      assertPercentageWithinCap(SalaryType.PERCENTAGE, 30),
    ).not.toThrow();
  });

  it('rejects a PERCENTAGE rate above 100', () => {
    expect(() => assertPercentageWithinCap(SalaryType.PERCENTAGE, 101)).toThrow(
      BadRequestException,
    );
    expect(() => assertPercentageWithinCap(SalaryType.PERCENTAGE, 101)).toThrow(
      'Foiz 100 dan oshmasligi kerak',
    );
  });

  it('never caps FIXED_PER_STUDENT or FIXED_MONTHLY, however large', () => {
    expect(() =>
      assertPercentageWithinCap(SalaryType.FIXED_PER_STUDENT, 999_999),
    ).not.toThrow();
    expect(() =>
      assertPercentageWithinCap(SalaryType.FIXED_MONTHLY, 999_999),
    ).not.toThrow();
  });
});
