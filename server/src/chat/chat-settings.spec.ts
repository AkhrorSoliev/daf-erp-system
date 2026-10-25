import { getSettingDefinition } from '../settings/settings.types';

describe('chat settings', () => {
  it('has the agreed defaults', () => {
    expect(getSettingDefinition('chat.enabled').defaultValue).toBe(false);
    expect(getSettingDefinition('chat.weekMinutesActive').defaultValue).toBe(
      60,
    );
    expect(getSettingDefinition('chat.weekMinutesRadio').defaultValue).toBe(30);
  });

  it('is company-level only', () => {
    for (const k of [
      'chat.enabled',
      'chat.weekMinutesActive',
      'chat.weekMinutesRadio',
    ] as const) {
      expect(getSettingDefinition(k).companyLevelOnly).toBe(true);
    }
  });

  it('refuses nonsense minutes', () => {
    const def = getSettingDefinition('chat.weekMinutesActive');
    expect(def.parse(90)).toBe(90);
    expect(() => def.parse(-1)).toThrow();
    expect(() => def.parse(1001)).toThrow();
    expect(() => def.parse(1.5)).toThrow();
    expect(() => def.parse('60')).toThrow();
  });
});
