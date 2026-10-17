import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from './settings.types';

describe('participation settings (spec 3.3)', () => {
  it('the attendance threshold defaults to 80, company-level, 0..100 integers', () => {
    const def = getSettingDefinition('participation.minAttendancePercent');
    expect(def.defaultValue).toBe(80);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(0)).toBe(0);
    expect(def.parse(100)).toBe(100);
    expect(() => def.parse(101)).toThrow(BadRequestException);
    expect(() => def.parse(-1)).toThrow(BadRequestException);
    expect(() => def.parse(79.5)).toThrow(BadRequestException);
  });

  it.each(['A1', 'A2', 'B1'] as const)(
    'the %s app threshold defaults to 100, company-level, 0..100 integers',
    (level) => {
      const def = getSettingDefinition(`participation.minAppPercent.${level}`);
      expect(def.defaultValue).toBe(100);
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse(0)).toBe(0);
      expect(() => def.parse(101)).toThrow(BadRequestException);
      expect(() => def.parse('100')).toThrow(BadRequestException);
    },
  );

  it('the minimum lessons default to 20, company-level, 1..200 integers', () => {
    const def = getSettingDefinition('participation.minLessons');
    expect(def.defaultValue).toBe(20);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(1)).toBe(1);
    expect(def.parse(200)).toBe(200);
    expect(() => def.parse(0)).toThrow(BadRequestException);
    expect(() => def.parse(201)).toThrow(BadRequestException);
    expect(() => def.parse(19.5)).toThrow(BadRequestException);
    expect(() => def.parse('20')).toThrow(BadRequestException);
  });

  it('the lateness limit defaults to 20, company-level, 0..100 integers', () => {
    const def = getSettingDefinition('participation.maxLatePercent');
    expect(def.defaultValue).toBe(20);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(0)).toBe(0);
    expect(def.parse(100)).toBe(100);
    expect(() => def.parse(101)).toThrow(BadRequestException);
    expect(() => def.parse(-1)).toThrow(BadRequestException);
    expect(() => def.parse(20.5)).toThrow(BadRequestException);
  });
});
