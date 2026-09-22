import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeadDto } from './create-lead.dto';
import { UpdateLeadDto } from './update-lead.dto';

/**
 * «Qayerdan bildi?» doskada ham majburiy (CEO qarori, 13.09.2026). HTTP
 * chegarasi — haqiqiy qorovul: UI'dagi yulduzcha API'ni to'g'ridan chaqirishni
 * to'xtatmaydi.
 */
const errorsOn = async (cls: new () => object, plain: object, field: string) =>
  (await validate(plainToInstance(cls, plain))).filter(
    (e) => e.property === field,
  );

const base = {
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '901234567',
  sectionId: 'sec-1',
};

describe('lid manbasi majburiyligi', () => {
  describe('CreateLeadDto', () => {
    it('manbasiz lidni rad etadi', async () => {
      expect(await errorsOn(CreateLeadDto, base, 'sourceId')).toHaveLength(1);
    });

    it("bo'sh satrni rad etadi", async () => {
      const errs = await errorsOn(
        CreateLeadDto,
        { ...base, sourceId: '' },
        'sourceId',
      );
      expect(errs[0]?.constraints).toHaveProperty('isNotEmpty');
    });

    it('manba bilan qabul qiladi', async () => {
      expect(
        await errorsOn(
          CreateLeadDto,
          { ...base, sourceId: 'src-1' },
          'sourceId',
        ),
      ).toHaveLength(0);
    });
  });

  describe('UpdateLeadDto', () => {
    it("manbani bo'sh satr bilan o'chirishni rad etadi", async () => {
      expect(
        await errorsOn(UpdateLeadDto, { sourceId: '' }, 'sourceId'),
      ).toHaveLength(1);
    });

    it("manba yuborilmasa o'zgartirmaydi — xato yo'q", async () => {
      expect(
        await errorsOn(UpdateLeadDto, { firstName: 'Ali' }, 'sourceId'),
      ).toHaveLength(0);
    });
  });
});
