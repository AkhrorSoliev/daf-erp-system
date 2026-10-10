import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { ContractDocumentsController } from './contract-documents.controller';

describe('ContractDocumentsController', () => {
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

  // Open to CEO, Branch Director and Administrator only: no Teacher,
  // Cashier or Student.
  it.each(['list', 'prefill', 'pdf'] as const)(
    '%s is a profile tab read (students.details)',
    (name) => {
      expect(routeAccess(ContractDocumentsController, name)).toEqual({
        kind: 'can',
        keys: ['students.details'],
      });
      expect(defaultRolesOf(ContractDocumentsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it.each(['create', 'update', 'sign', 'cancel'] as const)(
    '%s is a write (students.manage)',
    (name) => {
      expect(routeAccess(ContractDocumentsController, name)).toEqual({
        kind: 'can',
        keys: ['students.manage'],
      });
      expect(defaultRolesOf(ContractDocumentsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

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
