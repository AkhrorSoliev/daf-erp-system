import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { MetaLeadAdsService } from './meta-lead-ads.service';

const ENV: Record<string, string> = {
  META_APP_SECRET: 's',
  META_VERIFY_TOKEN: 'v',
  META_PAGE_TOKEN: 'tok',
  META_LEAD_SECTION_ID: 'sec-1',
};

const body = (...ids: string[]) => ({
  entry: [
    {
      changes: ids.map((id) => ({
        field: 'leadgen',
        value: { leadgen_id: id },
      })),
    },
  ],
});

describe('MetaLeadAdsService', () => {
  let prisma: any;
  let leads: { create: jest.Mock };
  let service: MetaLeadAdsService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn().mockResolvedValue(null) },
      leadSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sec-1', companyId: 7 }),
      },
      leadSource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'src-ig' }),
        aggregate: jest.fn(),
        create: jest.fn(),
      },
    };
    leads = { create: jest.fn().mockResolvedValue({}) };
    service = new MetaLeadAdsService(
      prisma,
      { get: (k: string) => ENV[k] } as unknown as ConfigService,
      leads as any,
      { recordCreate: jest.fn() } as any,
    );
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: 'ig',
        field_data: [
          { name: 'full_name', values: ['Ali Valiyev'] },
          { name: 'phone_number', values: ['+998901234567'] },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('creates the lead in the configured section with the Instagram source', async () => {
    await service.handle(body('L1'));

    expect(leads.create).toHaveBeenCalledWith(
      {
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '901234567',
        sectionId: 'sec-1',
        sourceId: 'src-ig',
        metaLeadId: 'L1',
      },
      7,
      { kind: 'meta-lead-ads' },
    );
  });

  it('skips a lead that was already imported, without calling Meta', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'x' });
    await service.handle(body('L1'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(leads.create).not.toHaveBeenCalled();
  });

  it('ignores a unique-key race with a concurrent delivery', async () => {
    leads.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    await expect(service.handle(body('L1'))).resolves.toBeUndefined();
  });

  it('throws when Meta fails, so the delivery is retried', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(service.handle(body('L1'))).rejects.toThrow('500');
  });

  it('skips a lead with no phone and ignores other webhook fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        field_data: [{ name: 'full_name', values: ['Ali'] }],
      }),
    });
    await service.handle({
      entry: [
        {
          changes: [
            { field: 'leadgen', value: { leadgen_id: 'L2' } },
            { field: 'feed', value: {} },
          ],
        },
      ],
    });
    expect(leads.create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
