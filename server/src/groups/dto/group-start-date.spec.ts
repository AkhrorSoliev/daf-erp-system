import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGroupDto } from './create-group.dto';
import { UpdateGroupDto } from './update-group.dto';

/**
 * Group.startDate is read through `utcMidnightFromDateStr`, which takes a
 * 'YYYY-MM-DD' calendar date (ADR-0016). An ISO instant slipped past a bare
 * `@IsString()` and became an Invalid Date inside Prisma — a 500 with no
 * message, which is how every group create failed from 10.09 to 14.09.2026.
 * The HTTP boundary must name the shape, so a wrong client gets a 400 that
 * says what to send instead of a silent server error.
 */
const errorsOn = async (cls: new () => object, plain: object, field: string) =>
  (await validate(plainToInstance(cls, plain))).filter(
    (e) => e.property === field,
  );

const cases: [string, new () => object, object][] = [
  ['CreateGroupDto', CreateGroupDto, { courseId: 'kurs-1', branchId: 1 }],
  ['UpdateGroupDto', UpdateGroupDto, {}],
];

describe.each(cases)('%s.startDate', (_name, cls, base) => {
  it("'YYYY-MM-DD' kalendar sanasini qabul qiladi", async () => {
    expect(
      await errorsOn(cls, { ...base, startDate: '2026-09-14' }, 'startDate'),
    ).toHaveLength(0);
  });

  it('ISO vaqt nuqtasini (toISOString) rad etadi', async () => {
    const errs = await errorsOn(
      cls,
      { ...base, startDate: '2026-09-13T19:00:00.000Z' },
      'startDate',
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].constraints).toHaveProperty('matches');
  });

  it('sanasiz soʻrovni ham oʻtkazadi', async () => {
    expect(await errorsOn(cls, base, 'startDate')).toHaveLength(0);
  });
});
