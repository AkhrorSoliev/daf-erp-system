import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeadQueryDto } from '../../dto/lead-query.dto';
import { AssignLeadOwnerDto } from './assign-lead-owner.dto';

/**
 * A user id is an int4. A longer number would pass the DTO, reach Prisma and
 * end as a 500, so the HTTP boundary refuses it.
 */
const errorsOn = async (cls: new () => object, plain: object, field: string) =>
  (await validate(plainToInstance(cls, plain))).filter(
    (e) => e.property === field,
  );

describe("«Mas'ul» filter (LeadQueryDto.owner)", () => {
  it.each([['me'], ['none'], ['7'], ['123456789'], ['me,none,12,34']])(
    'accepts %s',
    async (owner) => {
      expect(await errorsOn(LeadQueryDto, { owner }, 'owner')).toEqual([]);
    },
  );

  it.each([
    ['1234567890'],
    ['99999999999999999999'],
    ['me,1234567890'],
    ['x1'],
  ])('refuses %s', async (owner) => {
    expect(await errorsOn(LeadQueryDto, { owner }, 'owner')).toHaveLength(1);
  });
});

describe('AssignLeadOwnerDto.userId', () => {
  it.each([[1], [2_147_483_647], [null], [undefined]])(
    'accepts %s',
    async (userId) => {
      expect(await errorsOn(AssignLeadOwnerDto, { userId }, 'userId')).toEqual(
        [],
      );
    },
  );

  it.each([[2_147_483_648], [99999999999], [0]])(
    'refuses %s',
    async (userId) => {
      expect(
        await errorsOn(AssignLeadOwnerDto, { userId }, 'userId'),
      ).toHaveLength(1);
    },
  );
});
