import { ForbiddenException } from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { StatementsController } from './statements.controller';
import { StatementPortalController } from './statement-portal.controller';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn(),
}));

const model = {
  asOf: '2026-09-26',
  student: {
    id: 7,
    name: 'Test Student',
    groups: ['#036'],
    course: null,
    discountPercent: 0,
    branch: null,
  },
  balance: 0,
  headline: { kind: 'zero', amount: 0, unpaid: [] },
  equation: {
    paid: 0,
    items: [],
    lessons: 0,
    prepaidAhead: 0,
    unexplained: 0,
    balance: 0,
  },
  packEra: null,
  months: [],
  modelChanges: [],
  allocations: [],
};

const res = () => ({ setHeader: jest.fn(), end: jest.fn() });

describe('StatementsController', () => {
  const service = {
    build: jest.fn().mockResolvedValue(model),
    pdf: jest
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('%PDF-1.3'), model }),
  };
  const controller = new StatementsController(service as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('checks the branch before building the statement', async () => {
    (assertCallerMayTouchStudent as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException(),
    );
    await expect(controller.getStatement(7, 1, 99)).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.build).not.toHaveBeenCalled();
  });

  it('returns the model with the admin wording', async () => {
    const out = await controller.getStatement(7, 1, 99);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith({}, 99, 7, 1);
    expect(out.model).toBe(model);
    expect(out.view.answer.title).toBe("Qarzi yo'q.");
  });

  it('sends the PDF as a download named after the student and the day', async () => {
    const r = res();
    await controller.getStatementPdf(7, 1, 99, r as never);
    expect(r.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(r.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="tolovlar-hisoboti-7-26-09-2026.pdf"',
    );
    expect(r.end).toHaveBeenCalled();
  });
});

describe('StatementPortalController', () => {
  it("serves the signed-in student's own statement", async () => {
    const service = {
      pdf: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('%PDF-1.3'), model }),
    };
    const controller = new StatementPortalController(service as never);
    const r = res();
    await controller.myStatementPdf(7, 1, r as never);
    expect(service.pdf).toHaveBeenCalledWith(7, 1);
    expect(r.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="tolovlar-hisoboti-26-09-2026.pdf"',
    );
  });
});
