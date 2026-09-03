import { BadRequestException } from '@nestjs/common';
import { PaymentModel } from '@prisma/client';
import {
  getSettingDefinition,
  isSettingKey,
  SETTING_KEYS,
} from './settings.types';

describe('SETTING_DEFINITIONS registry', () => {
  it('covers exactly the four shipped payment keys', () => {
    expect(SETTING_KEYS.sort()).toEqual(
      [
        'payment.chargeDayOfMonth',
        'payment.defaultModel',
        'payment.excusedCreditEnabled',
        'payment.excusedCreditMonthlyCap',
      ].sort(),
    );
  });

  it('does NOT ship prorationMethod or debtGraceDays (no consumer, deliberately cut)', () => {
    expect(isSettingKey('payment.prorationMethod')).toBe(false);
    expect(isSettingKey('payment.debtGraceDays')).toBe(false);
  });

  describe('payment.defaultModel', () => {
    const def = getSettingDefinition('payment.defaultModel');

    it('defaults to MONTHLY', () => {
      expect(def.defaultValue).toBe(PaymentModel.MONTHLY);
    });

    it('accepts both enum values', () => {
      expect(def.parse('MONTHLY')).toBe('MONTHLY');
      expect(def.parse('LESSON_PACK')).toBe('LESSON_PACK');
    });

    it('rejects anything else', () => {
      expect(() => def.parse('WEEKLY')).toThrow(BadRequestException);
      expect(() => def.parse(null)).toThrow(BadRequestException);
      expect(() => def.parse(1)).toThrow(BadRequestException);
    });
  });

  describe('payment.excusedCreditEnabled', () => {
    const def = getSettingDefinition('payment.excusedCreditEnabled');

    it('defaults to true', () => {
      expect(def.defaultValue).toBe(true);
    });

    it('accepts booleans only', () => {
      expect(def.parse(true)).toBe(true);
      expect(def.parse(false)).toBe(false);
      expect(() => def.parse('true')).toThrow(BadRequestException);
      expect(() => def.parse(1)).toThrow(BadRequestException);
    });
  });

  describe('payment.excusedCreditMonthlyCap', () => {
    const def = getSettingDefinition('payment.excusedCreditMonthlyCap');

    it('defaults to null (limitsiz)', () => {
      expect(def.defaultValue).toBeNull();
    });

    it('accepts null and non-negative integers', () => {
      expect(def.parse(null)).toBeNull();
      expect(def.parse(0)).toBe(0);
      expect(def.parse(5)).toBe(5);
    });

    it('rejects negative numbers, non-integers, and other types', () => {
      expect(() => def.parse(-1)).toThrow(BadRequestException);
      expect(() => def.parse(1.5)).toThrow(BadRequestException);
      expect(() => def.parse('5')).toThrow(BadRequestException);
      expect(() => def.parse(undefined)).toThrow(BadRequestException);
    });
  });

  describe('payment.chargeDayOfMonth', () => {
    const def = getSettingDefinition('payment.chargeDayOfMonth');

    it('defaults to 1', () => {
      expect(def.defaultValue).toBe(1);
    });

    it('accepts 1..28', () => {
      expect(def.parse(1)).toBe(1);
      expect(def.parse(28)).toBe(28);
      expect(def.parse(15)).toBe(15);
    });

    it('rejects 0, 29, and non-integers (February guardrail)', () => {
      expect(() => def.parse(0)).toThrow(BadRequestException);
      expect(() => def.parse(29)).toThrow(BadRequestException);
      expect(() => def.parse(30)).toThrow(BadRequestException);
      expect(() => def.parse(15.5)).toThrow(BadRequestException);
    });
  });
});
