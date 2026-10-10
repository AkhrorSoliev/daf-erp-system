import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('CompanyController — route access', () => {
  let controller: CompanyController;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyController],
      providers: [{ provide: CompanyService, useValue: mockService }],
    }).compile();

    controller = module.get(CompanyController);
  });

  describe('update()', () => {
    it('is gated by the company settings capability', () => {
      expect(routeAccess(CompanyController, 'update')).toEqual({
        kind: 'can',
        keys: ['settings.company'],
      });
    });

    it('admits the CEO by default, nobody else', () => {
      expect(defaultRolesOf(CompanyController, 'update')).toEqual(['CEO']);
    });
  });

  describe('update() — tenant ownership', () => {
    beforeEach(() => mockService.update.mockClear());

    it('allows a CEO to update their OWN company', async () => {
      await controller.update(1001, { name: 'DaF' }, 1001);
      expect(mockService.update).toHaveBeenCalledWith(1001, { name: 'DaF' });
    });

    it('rejects updating a DIFFERENT company (cross-tenant)', () => {
      // The id-vs-companyId check throws synchronously, before the service call.
      expect(() => controller.update(2002, { name: 'Hacked' }, 1001)).toThrow(
        ForbiddenException,
      );
      expect(mockService.update).not.toHaveBeenCalled();
    });
  });

  describe.each(['findAll', 'findOne'] as const)('%s()', (name) => {
    it('is open to every signed-in account (their own company only)', () => {
      expect(routeAccess(CompanyController, name)).toEqual({
        kind: 'anyUser',
      });
    });
  });
});
