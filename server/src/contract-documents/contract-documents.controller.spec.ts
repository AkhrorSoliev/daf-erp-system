import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ContractDocumentsController } from './contract-documents.controller';

describe('ContractDocumentsController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const documents = {
    list: jest.fn().mockResolvedValue({ contracts: [], uncovered: [] }),
    prefill: jest.fn(),
    create: jest.fn(),
  };
  const lifecycle = {
    update: jest.fn(),
    sign: jest.fn(),
    cancel: jest.fn(),
    pdf: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-1.3'),
      filename: 'Shartnoma-DAF-2026-00001.pdf',
    }),
  };
  const controller = new ContractDocumentsController(
    documents as never,
    lifecycle as never,
  );

  const ctx = (handler: (...args: never[]) => unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => ContractDocumentsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

  it('is open to CEO, Branch Director and Administrator only', () => {
    expect(
      reflector.get<string[]>(ROLES_KEY, ContractDocumentsController),
    ).toEqual(['CEO', 'Branch Director', 'Administrator']);
    expect(guard.canActivate(ctx(controller.list, ['Administrator']))).toBe(
      true,
    );
    expect(guard.canActivate(ctx(controller.pdf, ['Branch Director']))).toBe(
      true,
    );
    // RolesGuard throws on a refusal (see lesson-reschedules.controller.spec.ts).
    expect(() =>
      guard.canActivate(ctx(controller.create, ['Teacher'])),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(ctx(controller.cancel, ['Cashier'])),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(ctx(controller.prefill, ['Student'])),
    ).toThrow(ForbiddenException);
  });

  it('passes the caller to the services', async () => {
    await controller.list({ studentId: 10001 }, 1, 99);
    expect(documents.list).toHaveBeenCalledWith(10001, 1, 99);
    await controller.cancel('doc-1', { reason: 'Xato' }, 1, 99);
    expect(lifecycle.cancel).toHaveBeenCalledWith('doc-1', 'Xato', 1, 99);
  });

  it('sends the PDF inline so the browser opens it for printing', async () => {
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.pdf('doc-1', 1, 99, res as never);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="Shartnoma-DAF-2026-00001.pdf"',
    );
    expect(res.end).toHaveBeenCalled();
  });
});
