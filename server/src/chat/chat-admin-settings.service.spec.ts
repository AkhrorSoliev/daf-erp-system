import { BadRequestException } from '@nestjs/common';
import { ChatAdminSettingsService } from './chat-admin-settings.service';

function make() {
  const store: Record<string, unknown> = {
    'chat.enabled': false,
    'chat.weekMinutesActive': 60,
    'chat.weekMinutesRadio': 30,
  };
  const settings = {
    get: jest.fn((_c: number, key: string) => Promise.resolve(store[key])),
    setMany: jest.fn((_c: number, entries: [string, unknown][]) => {
      for (const [k, v] of entries) store[k] = v;
      return Promise.resolve();
    }),
  };
  return { service: new ChatAdminSettingsService(settings as never), settings };
}

describe('ChatAdminSettingsService', () => {
  it('reads the three values with their defaults', async () => {
    const { service } = make();
    await expect(service.read(7)).resolves.toEqual({
      enabled: false,
      weekMinutesActive: 60,
      weekMinutesRadio: 30,
    });
  });

  it('writes only the given keys in one setMany call and returns the merged values', async () => {
    const { service, settings } = make();
    const out = await service.update(
      7,
      { enabled: true, weekMinutesRadio: 0 },
      99,
    );
    expect(settings.setMany).toHaveBeenCalledTimes(1);
    expect(settings.setMany).toHaveBeenCalledWith(
      7,
      [
        ['chat.enabled', true],
        ['chat.weekMinutesRadio', 0],
      ],
      99,
    );
    expect(out).toEqual({
      enabled: true,
      weekMinutesActive: 60,
      weekMinutesRadio: 0,
    });
  });

  it('rejects an empty patch', async () => {
    const { service, settings } = make();
    await expect(service.update(7, {}, 99)).rejects.toThrow(
      new BadRequestException('Kamida bitta sozlama yuborilishi kerak'),
    );
    expect(settings.setMany).not.toHaveBeenCalled();
  });
});
