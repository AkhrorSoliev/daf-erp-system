import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ParticipationSettingsDto } from './participation-settings.dto';

async function errorsFor(body: unknown) {
  return validate(plainToInstance(ParticipationSettingsDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('ParticipationSettingsDto', () => {
  it('accepts a full and a partial patch', async () => {
    expect(
      await errorsFor({
        minAttendancePercent: 75,
        minAppPercent: { A1: 90, A2: 80, B1: 100 },
      }),
    ).toHaveLength(0);
    expect(await errorsFor({ minAppPercent: { A1: 90 } })).toHaveLength(0);
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts the two new numbers, alone or with the others, at their ends', async () => {
    expect(
      await errorsFor({ minLessons: 20, maxLatePercent: 20 }),
    ).toHaveLength(0);
    expect(await errorsFor({ minLessons: 1 })).toHaveLength(0);
    expect(await errorsFor({ minLessons: 200 })).toHaveLength(0);
    expect(await errorsFor({ maxLatePercent: 0 })).toHaveLength(0);
    expect(await errorsFor({ maxLatePercent: 100 })).toHaveLength(0);
    expect(
      await errorsFor({
        minAttendancePercent: 80,
        minAppPercent: { A1: 100 },
        minLessons: 25,
        maxLatePercent: 15,
      }),
    ).toHaveLength(0);
  });

  it.each([
    { minAttendancePercent: 101 },
    { minAttendancePercent: -1 },
    { minAttendancePercent: 79.5 },
    { minAppPercent: { A1: 101 } },
    { minAppPercent: { B2: 50 } },
    { somethingElse: 1 },
    { minLessons: 0 },
    { minLessons: 201 },
    { minLessons: 19.5 },
    { minLessons: '20' },
    { maxLatePercent: -1 },
    { maxLatePercent: 101 },
    { maxLatePercent: 20.5 },
  ])('rejects %j', async (body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});
