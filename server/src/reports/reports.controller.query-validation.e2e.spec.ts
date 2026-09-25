import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsService } from './reports.service';
import { ReportsTeacherChangesService } from './reports-teacher-changes.service';

/**
 * The departed-students drill-downs must parse the page's filters exactly like
 * the rest of the report.
 *
 * The client sends multi-select filters comma-joined (`courseId=a,b`,
 * `teacherIds=5,7`), and only a DTO CLASS turns them into lists. A `@Query()`
 * typed `DepartedStudentsSummaryQueryDto & { reasonId?: string }` is emitted by
 * TypeScript as `Object`, the global ValidationPipe skips `Object`, and the raw
 * strings reached Prisma as `{ in: '5,7' }` — which Prisma rejects. Picking a
 * course or a teacher on /reports/departed-students therefore turned the
 * "Jami o'zgarishlar" dialog into a 500 that the page rendered as "Ma'lumot
 * yo'q".
 *
 * The controller, the pipe and the drill-down service are real; only Prisma is
 * replaced, by a recorder. Every assertion is on the query that would have gone
 * to the database.
 */

/** The parts of a Prisma call's argument this spec reads. */
interface RecordedArgs {
  where?: unknown;
  skip?: number;
  take?: number;
}

interface RecordedQuery {
  query: string;
  args: RecordedArgs;
}

/** Prisma stand-in: records every `prisma.<model>.<method>(args)`; lists come back empty. */
function recordingPrisma() {
  const queries: RecordedQuery[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_model, method) => (args?: RecordedArgs) => {
          queries.push({
            query: `${name}.${String(method)}`,
            args: args ?? {},
          });
          return Promise.resolve(method === 'count' ? 0 : []);
        },
      },
    );
  const prisma = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === '$transaction'
          ? (ops: Promise<unknown>[]) => Promise.all(ops)
          : model(String(prop)),
    },
  ) as unknown as PrismaService;
  return { prisma, queries };
}

const CEO = { id: 10001, roles: ['CEO'], companyId: 1001 };
const COURSE_A = '3f2a8c1e-0000-4000-8000-000000000001';
const COURSE_B = '3f2a8c1e-0000-4000-8000-000000000002';

// '2026-04-01'..'2026-09-25' as Tashkent days (UTC+5): the first day's 00:00,
// and 00:00 of the day AFTER the last one (exclusive).
const RANGE = { startDate: '2026-04-01', endDate: '2026-09-25' };
const RANGE_UTC = {
  gte: new Date('2026-03-31T19:00:00.000Z'),
  lt: new Date('2026-09-25T19:00:00.000Z'),
};

describe('departed-students drill-downs — filters reach the database as lists', () => {
  let app: INestApplication;
  let server: Server;
  const { prisma, queries } = recordingPrisma();

  beforeAll(async () => {
    const teacherChanges = new ReportsTeacherChangesService(prisma);
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          // The facade only forwards these two; everything under test happens
          // before it (route typing, DTO, pipe) or after it (the service).
          useValue: {
            getTeacherChangesList: (
              ...args: Parameters<
                ReportsTeacherChangesService['getTeacherChangesList']
              >
            ) => teacherChanges.getTeacherChangesList(...args),
            getTransferredList: (
              ...args: Parameters<
                ReportsTeacherChangesService['getTransferredList']
              >
            ) => teacherChanges.getTransferredList(...args),
          },
        },
        { provide: PrismaService, useValue: {} },
        { provide: ReportsExcelService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same pipe as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Stands in for JwtStrategy: the test names the decoded token in a header.
    app.use(
      (
        req: { headers: Record<string, string>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const raw = req.headers['x-test-user'];
        if (raw) req.user = JSON.parse(raw);
        next();
      },
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    queries.length = 0;
  });

  function get(url: string, query: Record<string, string>) {
    return request(server)
      .get(url)
      .query(query)
      .set('x-test-user', JSON.stringify(CEO));
  }

  function argsOf(query: string) {
    const hit = queries.find((q) => q.query === query);
    if (!hit) throw new Error(`no ${query} was issued`);
    return hit.args;
  }

  describe('GET /reports/departed-students/teacher-changes-list', () => {
    const URL = '/reports/departed-students/teacher-changes-list';

    it('filters by every picked course and teacher, and keeps the reason filter', async () => {
      const res = await get(URL, {
        ...RANGE,
        courseId: `${COURSE_A},${COURSE_B}`,
        teacherIds: '5,7',
        reasonId: 'null',
      });

      expect(res.status).toBe(200);
      expect(argsOf('groupTeacherHistory.findMany').where).toEqual({
        createdAt: RANGE_UTC,
        group: {
          companyId: 1001,
          deletedAt: null,
          courseId: { in: [COURSE_A, COURSE_B] },
          teachers: { some: { teacherId: { in: [5, 7] } } },
        },
        changeReasonId: null,
      });
    });

    it('refuses a malformed course id with 400 instead of querying with it', async () => {
      const res = await get(URL, { ...RANGE, courseId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(queries).toEqual([]);
    });
  });

  describe('GET /reports/departed-students/transferred-list', () => {
    const URL = '/reports/departed-students/transferred-list';

    it('filters by the picked course and teacher, and pages as asked', async () => {
      const res = await get(URL, {
        ...RANGE,
        courseId: COURSE_A,
        teacherIds: '5',
        page: '2',
        pageSize: '20',
        transferReasonId: 'null',
      });

      expect(res.status).toBe(200);
      const args = argsOf('enrollment.findMany');
      expect(args.where).toEqual({
        deletedAt: null,
        student: { companyId: 1001, deletedAt: null },
        group: {
          courseId: COURSE_A,
          teachers: { some: { teacherId: { in: [5] } } },
        },
        status: 'TRANSFERRED',
        statusChangedAt: RANGE_UTC,
        transferReasonId: null,
      });
      expect(args).toMatchObject({ skip: 20, take: 20 });
    });
  });
});

describe('ReportsController — every whole-query parameter is validated', () => {
  /**
   * A `@Query()` whose TypeScript type is not a class (an intersection, an
   * inline object, an interface, `any`) is emitted as `Object`, and the global
   * ValidationPipe passes `Object` through untouched: no validation, no
   * transform, no whitelist. Its filters then arrive as raw strings. This is
   * how both drill-downs above broke; the check covers every route of the
   * controller, including ones added later.
   */
  it('types every @Query() with a DTO class', () => {
    const proto = ReportsController.prototype as unknown as Record<
      string,
      unknown
    >;
    let checked = 0;
    const unvalidated: string[] = [];
    for (const handler of Object.getOwnPropertyNames(proto)) {
      const args = (Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ReportsController,
        handler,
      ) ?? {}) as Record<string, { index: number; data?: unknown }>;
      const types = (Reflect.getMetadata('design:paramtypes', proto, handler) ??
        []) as unknown[];
      for (const [key, arg] of Object.entries(args)) {
        const wholeQuery =
          key.startsWith(`${RouteParamtypes.QUERY}:`) && arg.data === undefined;
        if (!wholeQuery) continue;
        checked += 1;
        if (types[arg.index] === Object) unvalidated.push(handler);
      }
    }

    // Guards against a vacuous pass if the metadata lookup ever breaks.
    expect(checked).toBeGreaterThan(20);
    expect(unvalidated).toEqual([]);
  });
});
