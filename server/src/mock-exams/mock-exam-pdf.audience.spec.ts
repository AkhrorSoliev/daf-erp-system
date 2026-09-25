import { MockExamPdfService } from './mock-exam-pdf.service';

jest.mock('../receipts/pdf/render', () => ({
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
  getCompanyLogoDataUrl: jest.fn().mockReturnValue(null),
}));

/**
 * CEO, 2026-09-25: only those who paid get their results, and the results PDF
 * is what the bot sends. A registration that still owes its fee must not be a
 * row in it.
 */
describe('MockExamPdfService.generate — the PDF lists those who paid', () => {
  it('asks only for registrations in the results audience', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      mockExam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          title: 'Mock 2.0 Sentabr',
          examDate: new Date('2026-09-30T00:00:00.000Z'),
          maxScore: 100,
          passingScore: null,
          announcedAt: null,
          section: { name: 'Mock' },
          subjects: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      mockExamParticipant: { findMany },
    };
    const upload = {
      uploadBuffer: jest.fn().mockResolvedValue('https://files.example/x.pdf'),
    };
    const service = new MockExamPdfService(prisma as never, upload as never);

    await service.generate('exam-1');

    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ examId: 'exam-1', deletedAt: null });
    expect(where.AND).toEqual([
      {
        OR: [
          { paid: true },
          { feeAmount: 0 },
          { feeAmount: null, exam: { price: 0 } },
        ],
      },
    ]);
  });
});
