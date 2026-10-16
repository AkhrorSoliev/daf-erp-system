import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from './settings.types';

describe('KPI settings (ADR-0094)', () => {
  it('the switch is on by default and company-level', () => {
    const def = getSettingDefinition('kpi.enabled');
    expect(def.defaultValue).toBe(true);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(false)).toBe(false);
    expect(() => def.parse('true')).toThrow(BadRequestException);
  });

  it.each(['kpi.leadPaid.mode', 'kpi.promiseKept.mode'] as const)(
    '%s takes FIXED or PERCENT, FIXED by default',
    (key) => {
      const def = getSettingDefinition(key);
      expect(def.defaultValue).toBe('FIXED');
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse('PERCENT')).toBe('PERCENT');
      expect(() => def.parse('percent')).toThrow(BadRequestException);
    },
  );

  it.each([
    ['kpi.leadPaid.value', 50_000],
    ['kpi.promiseKept.value', 20_000],
  ] as const)(
    "%s defaults to %i and takes whole so'm 0..10 000 000",
    (key, dflt) => {
      const def = getSettingDefinition(key);
      expect(def.defaultValue).toBe(dflt);
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse(0)).toBe(0);
      expect(def.parse(10_000_000)).toBe(10_000_000);
      expect(() => def.parse(10_000_001)).toThrow(BadRequestException);
      expect(() => def.parse(-1)).toThrow(BadRequestException);
      expect(() => def.parse(1.5)).toThrow(BadRequestException);
    },
  );
});
