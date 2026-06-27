import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomFormsService } from './custom-forms.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LeadsService } from '../leads/leads.service';
import { FormFieldDto } from './dto/form-field.dto';
function fields(...overrides: Partial<FormFieldDto>[]): FormFieldDto[] {
  return overrides.map((o, i) => ({
    id: o.id ?? `f${i}`,
    type: o.type ?? 'text',
    label: o.label ?? `Field ${i}`,
    required: o.required ?? false,
    placeholder: o.placeholder,
    options: o.options,
    mapsTo: o.mapsTo,
  }));
}
function baseFields(): FormFieldDto[] {
  return fields(
    { id: 'fn', type: 'text', label: 'Ism', required: true, mapsTo: 'firstName' },
    { id: 'ln', type: 'text', label: 'Familya', required: true, mapsTo: 'lastName' },
    { id: 'ph', type: 'phone', label: 'Telefon', required: true, mapsTo: 'phone' },
  );
}
describe('CustomFormsService', () => {
  let service: CustomFormsService;
  let prisma: any;
  let history: any;
  let leads: any;
  beforeEach(async () => {
    prisma = {
      customForm: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      customFormSubmission: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
      leadSection: { findFirst: jest.fn().mockResolvedValue({ id: 'sec-1' }) },
      leadSource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'src-1' }),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: 0 } }),
        create: jest.fn().mockResolvedValue({ id: 'src-new', name: 'reklama' }),
      },
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
    };
    leads = { create: jest.fn() };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFormsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: LeadsService, useValue: leads },
      ],
    }).compile();
    service = moduleRef.get(CustomFormsService);
  });
  describe('validateFields (via create)', () => {
    it('rejects when no firstName mapping exists', async () => {
      await expect(
        service.create(
          {
            title: 'F1',
            sectionId: 'sec-1',
            fields: fields(
              { id: 'ln', type: 'text', label: 'Familya', required: true, mapsTo: 'lastName' },
              { id: 'ph', type: 'phone', label: 'Telefon', required: true, mapsTo: 'phone' },
            ),
          },
          1,
          10,
        ),
      ).rejects.toThrow(/Ism maydoni majburiy/);
    });
    it('rejects when a mapsTo field is not required', async () => {
      await expect(
        service.create(
          {
            title: 'F1',
            sectionId: 'sec-1',
            fields: fields(
              { id: 'fn', type: 'text', label: 'Ism', required: false, mapsTo: 'firstName' },
              { id: 'ln', type: 'text', label: 'Familya', required: true, mapsTo: 'lastName' },
              { id: 'ph', type: 'phone', label: 'Telefon', required: true, mapsTo: 'phone' },
            ),
          },
          1,
          10,
        ),
      ).rejects.toThrow(/majburiy bo'lishi kerak/);
    });
    it('rejects when a phone mapping is not a phone field type', async () => {
      await expect(
        service.create(
          {
            title: 'F1',
            sectionId: 'sec-1',
            fields: fields(
              { id: 'fn', type: 'text', label: 'Ism', required: true, mapsTo: 'firstName' },
              { id: 'ln', type: 'text', label: 'Familya', required: true, mapsTo: 'lastName' },
              { id: 'ph', type: 'text', label: 'Telefon', required: true, mapsTo: 'phone' },
            ),
          },
          1,
          10,
        ),
      ).rejects.toThrow(/turi "phone"/);
    });
    it('rejects when two fields map to the same slot', async () => {
      await expect(
        service.create(
          {
            title: 'F1',
            sectionId: 'sec-1',
            fields: fields(
              { id: 'fn', type: 'text', label: 'Ism', required: true, mapsTo: 'firstName' },
              { id: 'fn2', type: 'text', label: 'Ism (yana)', required: true, mapsTo: 'firstName' },
              { id: 'ln', type: 'text', label: 'Familya', required: true, mapsTo: 'lastName' },
              { id: 'ph', type: 'phone', label: 'Telefon', required: true, mapsTo: 'phone' },
            ),
          },
          1,
          10,
        ),
      ).rejects.toThrow(/faqat bitta maydon/);
    });
    it('rejects select/radio fields with no options', async () => {
      await expect(
        service.create(
          {
            title: 'F1',
            sectionId: 'sec-1',
            fields: [
              ...baseFields(),
              { id: 'sel', type: 'select', label: 'Manba', required: false },
            ],
          },
          1,
          10,
        ),
      ).rejects.toThrow(/kamida bitta variant/);
    });
    it('creates with a generated slug when validation passes', async () => {
      prisma.customForm.create.mockResolvedValue({
        id: 'cf-1',
        slug: 'abc1234567',
        title: 'F1',
      });
      const result = await service.create(
        { title: 'F1', sectionId: 'sec-1', fields: baseFields() },
        1,
        10,
      );
      expect(prisma.customForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'F1',
            sectionId: 'sec-1',
            companyId: 1,
            createdById: 10,
            slug: expect.any(String),
          }),
        }),
      );
      expect(history.recordCreate).toHaveBeenCalled();
      expect(result.slug).toBe('abc1234567');
    });
  });
  describe('getPublicSchema', () => {
    it('throws when the slug is missing or inactive', async () => {
      prisma.customForm.findFirst.mockResolvedValue(null);
      await expect(service.getPublicSchema('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
    it('strips mapsTo from the public schema', async () => {
      prisma.customForm.findFirst.mockResolvedValue({
        id: 'cf-1',
        title: 'F1',
        description: null,
        fields: baseFields(),
      });
      const result = await service.getPublicSchema('abc1234567');
      expect(result.fields.every((f: any) => !('mapsTo' in f))).toBe(true);
    });
  });
  describe('submit', () => {
    beforeEach(() => {
      prisma.customForm.findFirst.mockResolvedValue({
        id: 'cf-1',
        companyId: 1,
        sectionId: 'sec-1',
        sourceId: 'src-1',
        fields: baseFields(),
      });
      leads.create.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
    });
    it('rejects when a required field is missing', async () => {
      await expect(
        service.submit(
          'abc1234567',
          { data: { fn: 'Aziz', ln: 'Karimov' } },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
    it('normalises 9-digit phone and strips +998 prefix', async () => {
      await service.submit(
        'abc1234567',
        { data: { fn: 'Aziz', ln: 'Karimov', ph: '+998901234567' } },
        {},
      );
      expect(leads.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          sectionId: 'sec-1',
          sourceId: 'src-1',
        }),
        1,
        null,
      );
    });
    it('persists the submission row linked to the new lead', async () => {
      await service.submit(
        'abc1234567',
        { data: { fn: 'Aziz', ln: 'Karimov', ph: '901234567' } },
        { ipAddress: '1.2.3.4', userAgent: 'curl' },
      );
      expect(prisma.customFormSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          formId: 'cf-1',
          leadId: 'lead-1',
          ipAddress: '1.2.3.4',
          userAgent: 'curl',
        }),
      });
    });
    it('attributes the lead to an existing source named by the link tag', async () => {
      prisma.leadSource.findFirst.mockResolvedValue({ id: 'src-insta' });
      await service.submit(
        'abc1234567',
        { data: { fn: 'Aziz', ln: 'Karimov', ph: '901234567' }, source: 'Instagram' },
        {},
      );
      expect(prisma.leadSource.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { equals: 'Instagram', mode: 'insensitive' },
            deletedAt: null,
          }),
        }),
      );
      expect(leads.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 'src-insta' }),
        1,
        null,
      );
      expect(prisma.leadSource.create).not.toHaveBeenCalled();
    });

    it('creates a LeadSource on the fly for an unknown link tag', async () => {
      prisma.leadSource.findFirst.mockResolvedValue(null);
      await service.submit(
        'abc1234567',
        { data: { fn: 'Aziz', ln: 'Karimov', ph: '901234567' }, source: 'reklama' },
        {},
      );
      expect(prisma.leadSource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'reklama' }),
        }),
      );
      expect(leads.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 'src-new' }),
        1,
        null,
      );
    });

    it('falls back to the form source when no link tag is supplied', async () => {
      await service.submit(
        'abc1234567',
        { data: { fn: 'Aziz', ln: 'Karimov', ph: '901234567' } },
        {},
      );
      expect(prisma.leadSource.findFirst).not.toHaveBeenCalled();
      expect(leads.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 'src-1' }),
        1,
        null,
      );
    });

    it('rejects select values that are not part of the configured options', async () => {
      prisma.customForm.findFirst.mockResolvedValue({
        id: 'cf-1',
        companyId: 1,
        sectionId: 'sec-1',
        sourceId: null,
        fields: [
          ...baseFields(),
          {
            id: 'src',
            type: 'select',
            label: 'Manba',
            required: true,
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
          },
        ],
      });
      await expect(
        service.submit(
          'abc1234567',
          { data: { fn: 'A', ln: 'K', ph: '901234567', src: 'z' } },
          {},
        ),
      ).rejects.toThrow(/noto'g'ri qiymat/);
    });
  });
});
