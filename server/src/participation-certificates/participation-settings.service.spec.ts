import { BadRequestException } from '@nestjs/common';
import { ParticipationSettingsService } from './participation-settings.service';

const DEFAULTS: Record<string, number> = {
  'participation.minAttendancePercent': 80,
  'participation.minLessons': 20,
  'participation.maxLatePercent': 20,
};

function makeService(values: Record<string, number> = {}) {
  const settings = {
    get: jest.fn((_company: number, key: string) =>
      Promise.resolve(values[key] ?? DEFAULTS[key] ?? 100),
    ),
    setMany: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new ParticipationSettingsService(settings as never),
    settings,
  };
}

describe('ParticipationSettingsService', () => {
  it('reads the six numbers', async () => {
    const { service } = makeService({
      'participation.minAttendancePercent': 75,
      'participation.minAppPercent.A2': 60,
    });
    expect(await service.read(1001)).toEqual({
      minAttendancePercent: 75,
      minAppPercent: { A1: 100, A2: 60, B1: 100 },
      minLessons: 20,
      maxLatePercent: 20,
    });
  });

  it('writes only what the patch names, in one setMany call', async () => {
    const { service, settings } = makeService();
    await service.update(
      1001,
      { minAttendancePercent: 70, minAppPercent: { B1: 90 } },
      7,
    );
    expect(settings.setMany).toHaveBeenCalledTimes(1);
    expect(settings.setMany).toHaveBeenCalledWith(
      1001,
      [
        ['participation.minAttendancePercent', 70],
        ['participation.minAppPercent.B1', 90],
      ],
      7,
    );
  });

  it('writes the new conditions in the same setMany call', async () => {
    const { service, settings } = makeService();
    await service.update(
      1001,
      { minAttendancePercent: 70, minLessons: 25, maxLatePercent: 10 },
      7,
    );
    expect(settings.setMany).toHaveBeenCalledTimes(1);
    expect(settings.setMany).toHaveBeenCalledWith(
      1001,
      [
        ['participation.minAttendancePercent', 70],
        ['participation.minLessons', 25],
        ['participation.maxLatePercent', 10],
      ],
      7,
    );
  });

  it('accepts a patch of one new number alone, and writes a 0 limit', async () => {
    const { service, settings } = makeService();
    await service.update(1001, { maxLatePercent: 0 }, 7);
    expect(settings.setMany).toHaveBeenCalledWith(
      1001,
      [['participation.maxLatePercent', 0]],
      7,
    );
  });

  it('refuses an empty patch', async () => {
    const { service, settings } = makeService();
    await expect(service.update(1001, {}, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(settings.setMany).not.toHaveBeenCalled();
  });

  it('gives the app threshold only to the levels the app teaches', () => {
    const { service } = makeService();
    const s = {
      minAttendancePercent: 80,
      minAppPercent: { A1: 100, A2: 90, B1: 70 },
      minLessons: 20,
      maxLatePercent: 20,
    };
    expect(service.thresholdsFor(s, 'A2')).toEqual({
      attendance: 80,
      app: 90,
      minLessons: 20,
      maxLatePercent: 20,
    });
    expect(service.thresholdsFor(s, 'B2')).toEqual({
      attendance: 80,
      app: null,
      minLessons: 20,
      maxLatePercent: 20,
    });
  });
});
