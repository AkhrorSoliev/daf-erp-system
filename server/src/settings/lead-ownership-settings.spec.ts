import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from './settings.types';

describe('lead ownership settings (ADR-0092)', () => {
  it.each([
    ['leads.maxUntouched', 10, 1, 100],
    ['leads.firstActionHours', 2, 1, 24],
    ['leads.followUpDays', 3, 1, 14],
  ] as const)(
    '%s defaults to %i and accepts whole numbers %i..%i',
    (key, defaultValue, min, max) => {
      const def = getSettingDefinition(key);
      expect(def.defaultValue).toBe(defaultValue);
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse(min)).toBe(min);
      expect(def.parse(max)).toBe(max);
      expect(() => def.parse(min - 1)).toThrow(BadRequestException);
      expect(() => def.parse(max + 1)).toThrow(BadRequestException);
      expect(() => def.parse(1.5)).toThrow(BadRequestException);
      expect(() => def.parse('5')).toThrow(BadRequestException);
    },
  );
});
