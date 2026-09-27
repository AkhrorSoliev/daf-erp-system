import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeStudentStatusDto } from './change-student-status.dto';

// Same options as the global ValidationPipe in main.ts.
async function rejected(body: object) {
  const dto = plainToInstance(ChangeStudentStatusDto, body);
  return (
    await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
  ).map((e) => e.property);
}

describe('ChangeStudentStatusDto — departurePolicy (ADR-0043)', () => {
  it('accepts a status change without a policy', async () => {
    expect(await rejected({ status: 'EXPELLED', reason: 'x' })).toEqual([]);
  });

  it('accepts each of the three policies', async () => {
    for (const departurePolicy of [
      'STUDENT_CANCELLED',
      'CENTER_INITIATIVE',
      'QUALITY_CLAIM',
    ]) {
      expect(
        await rejected({ status: 'EXPELLED', reason: 'x', departurePolicy }),
      ).toEqual([]);
    }
  });

  it('refuses anything else', async () => {
    expect(
      await rejected({
        status: 'EXPELLED',
        reason: 'x',
        departurePolicy: 'COURSE_NOT_STARTED',
      }),
    ).toEqual(['departurePolicy']);
  });
});
