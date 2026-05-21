import { Test, TestingModule } from '@nestjs/testing';
import { StudentsReadService } from './students-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { StudentQueryDto } from './dto/student-query.dto';

describe('StudentsReadService', () => {
  let service: StudentsReadService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsReadService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: {} },
      ],
    }).compile();

    service = module.get(StudentsReadService);
  });

  describe('findAll — ungrouped filter', () => {
    it('matches active students not in any active group (dropped-out students included)', async () => {
      await service.findAll(
        { status: 'ungrouped' } as StudentQueryDto,
        1001,
      );

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
      expect(where.companyId).toBe(1001);
      // A student is "ungrouped" unless they have an ACTIVE enrollment in an
      // ACTIVE group — so students whose only enrollments are DROPPED/FROZEN
      // (a non-empty enrollments list) now match too.
      expect(where.enrollments).toEqual({
        none: {
          deletedAt: null,
          status: 'ACTIVE',
          group: { deletedAt: null, statusEnum: 'ACTIVE' },
        },
      });
    });

    it('does not apply the ungrouped enrollment filter for other statuses', async () => {
      await service.findAll({} as StudentQueryDto, 1001);

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.enrollments).toBeUndefined();
      expect(where.status).toBeUndefined();
    });
  });
});
