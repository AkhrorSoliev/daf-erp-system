import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LateAttendanceDto } from './late-attendance.dto';
import { NotHeldDto } from './not-held.dto';

// Same options as the global ValidationPipe in main.ts, which also transforms,
// so the service receives what `plainToInstance` returns here.
async function check<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

// A reason of spaces is no reason: it was accepted and stored as ''.
describe("«Dars bo'ldimi?» answer reasons", () => {
  it("«Bo'lmadi» refuses a blank reason and keeps the trimmed one", async () => {
    const blank = await check(NotHeldDto, { reason: ' \t ', action: 'CANCEL' });
    expect(blank.messages).toEqual(['Sababini yozing']);

    const given = await check(NotHeldDto, {
      reason: '  Ustoz kasal  ',
      action: 'CANCEL',
    });
    expect(given.messages).toEqual([]);
    expect(given.dto.reason).toBe('Ustoz kasal');
  });

  it("the CEO's exemption refuses a blank reason and keeps the trimmed one", async () => {
    const blank = await check(LateAttendanceDto, {
      entries: [],
      teacherPayExempt: true,
      exemptReason: '   ',
    });
    expect(blank.messages).toEqual(['Sababini yozing']);

    const given = await check(LateAttendanceDto, {
      entries: [],
      teacherPayExempt: true,
      exemptReason: " Akkaunt yo'q edi ",
    });
    expect(given.messages).toEqual([]);
    expect(given.dto.exemptReason).toBe("Akkaunt yo'q edi");
  });
});
