import { BadRequestException } from '@nestjs/common';
import { PaymentModel } from '@prisma/client';
import {
  getSettingDefinition,
  isSettingKey,
  SETTING_KEYS,
} from './settings.types';

describe('SETTING_DEFINITIONS registry', () => {
  it('covers exactly the five shipped payment keys', () => {
    expect(SETTING_KEYS.sort()).toEqual(
      [
        'payment.chargeDayOfMonth',
        'payment.debtWriteOffEnabled',
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

    it('defaults to LESSON_PACK until the cutover — a course made after deploy must not silently go monthly', () => {
      expect(def.defaultValue).toBe(PaymentModel.LESSON_PACK);
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

    it('accepts booleans only, and names ITSELF in the error', () => {
      expect(def.parse(true)).toBe(true);
      expect(def.parse(false)).toBe(false);
      expect(() => def.parse('true')).toThrow(BadRequestException);
      expect(() => def.parse(1)).toThrow(BadRequestException);
      // Ikkala boolean kalitning `parse` qatori bir xil ko'rinadi —
      // xabardagi kalit nomi almashib ketmasligi shu yerda qotiriladi.
      expect(() => def.parse('true')).toThrow(
        /payment\.excusedCreditEnabled faqat true\/false/,
      );
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

  describe('payment.debtWriteOffEnabled', () => {
    const def = getSettingDefinition('payment.debtWriteOffEnabled');

    it('defaults to false — CEO (21.09.2026, 9-javob): qarz kechirilmaydi', () => {
      expect(def.defaultValue).toBe(false);
    });

    it('accepts booleans', () => {
      expect(def.parse(true)).toBe(true);
      expect(def.parse(false)).toBe(false);
    });

    it('rejects non-booleans with an Uzbek message that names THIS key', () => {
      expect(() => def.parse('ha')).toThrow(BadRequestException);
      expect(() => def.parse(1)).toThrow(BadRequestException);
      expect(() => def.parse(null)).toThrow(BadRequestException);
      // Kalit nomi xabarga QO'LDA yoziladi (`parseBoolean('payment.…', raw)`)
      // va qo'shni ta'rifdagi qator bilan bir xil ko'rinadi — nusxa olinsa
      // CEO noto'g'ri sozlama nomini ko'rardi. Xabarning o'zi tekshiriladi.
      expect(() => def.parse('ha')).toThrow(
        /payment\.debtWriteOffEnabled faqat true\/false/,
      );
    });

    it('is company-level only — a Branch Director must not re-enable it for their own branch', () => {
      // CEO (21.09.2026, 9-javob) butun kompaniya uchun qaror qildi; qarz
      // kechirish tugmalari esa Branch Director qo'lida. Filial darajasida
      // yozilsa, direktor taqiqni o'ziga qayta yoqib olardi.
      expect(def.companyLevelOnly).toBe(true);
    });
  });
});
