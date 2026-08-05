import { Test, TestingModule } from '@nestjs/testing';
import { LeadsBoardService } from './leads-board.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LeadsBoardService', () => {
  let service: LeadsBoardService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      leadColumn: { findMany: jest.fn() },
      lead: { groupBy: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsBoardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LeadsBoardService);
  });

  it('attaches per-section lead counts, defaulting empty sections to 0', async () => {
    prisma.leadColumn.findMany.mockResolvedValue([
      {
        id: 'col-1',
        name: 'Yangi Lidlar',
        order: 0,
        isSystem: true,
        systemKey: 'NEW',
        sections: [
          { id: 'sec-1', name: 'Umumiy', order: 0 },
          { id: 'sec-2', name: 'Reklama', order: 1 },
        ],
      },
    ]);
    prisma.lead.groupBy.mockResolvedValue([{ sectionId: 'sec-1', _count: 3 }]);

    const board = await service.getBoard(1001, null);

    expect(board[0].sections[0].leadCount).toBe(3);
    expect(board[0].sections[1].leadCount).toBe(0);
  });
});
