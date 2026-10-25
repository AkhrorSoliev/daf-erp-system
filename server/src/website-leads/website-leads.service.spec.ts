import { UnauthorizedException } from '@nestjs/common';
import { WebsiteLeadsService } from './website-leads.service';

describe('WebsiteLeadsService', () => {
  const column = { id: 'col-new' };
  const make = (existingSection: { id: string } | null) => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 2, companyId: 1 }),
      },
      leadColumn: { findFirst: jest.fn().mockResolvedValue(column) },
      leadSection: {
        findFirst: jest.fn().mockResolvedValue(existingSection),
        create: jest.fn().mockResolvedValue({ id: 'sec-new' }),
      },
      leadSource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'src' }),
      },
    };
    const leads = { create: jest.fn().mockResolvedValue({}) };
    const history = { recordCreate: jest.fn() };
    const config = { get: () => 'secret' };
    const svc = new WebsiteLeadsService(
      prisma as never,
      config as never,
      leads as never,
      history as never,
    );
    return { svc, prisma, leads };
  };
  const dto = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '+998 90 123 45 67',
    branchId: 2,
  };

  it('rejects a wrong key', () => {
    expect(() => make(null).svc.assertKey('nope')).toThrow(
      UnauthorizedException,
    );
    expect(() => make(null).svc.assertKey('secret')).not.toThrow();
  });

  it('creates the WEBSITE section when the branch has none, and the lead lands in it', async () => {
    const { svc, prisma, leads } = make(null);
    await svc.create(dto);
    expect(prisma.leadSection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          systemKey: 'WEBSITE',
          columnId: 'col-new',
        }),
      }),
    );
    expect(leads.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '901234567', sectionId: 'sec-new' }),
      1,
      { kind: 'public-form' },
    );
  });

  it('reuses the existing WEBSITE section', async () => {
    const { svc, prisma, leads } = make({ id: 'sec-old' });
    await svc.create(dto);
    expect(prisma.leadSection.create).not.toHaveBeenCalled();
    expect(leads.create.mock.calls[0][0].sectionId).toBe('sec-old');
  });
});
