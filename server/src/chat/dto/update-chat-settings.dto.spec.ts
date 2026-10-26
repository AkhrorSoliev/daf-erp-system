import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateChatSettingsDto } from './chat.dto';

const errs = (o: object) =>
  validate(plainToInstance(UpdateChatSettingsDto, o), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('UpdateChatSettingsDto', () => {
  it('accepts valid and partial bodies', async () => {
    expect(await errs({ enabled: true, weekMinutesActive: 1000 })).toEqual([]);
    expect(await errs({ weekMinutesRadio: 0 })).toEqual([]);
  });
  it.each([1001, -1, 1.5])('rejects minutes %p', async (v) => {
    expect((await errs({ weekMinutesActive: v })).length).toBe(1);
  });
  it('rejects non-boolean enabled and unknown fields', async () => {
    expect((await errs({ enabled: 'yes' })).length).toBe(1);
    expect((await errs({ other: 1 })).length).toBe(1);
  });
});
