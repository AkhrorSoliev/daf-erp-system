import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { DafPortalController } from './daf-portal.controller';
import { DafPortalReadService } from './daf-portal-read.service';
import { DafAttemptService } from './daf-attempt.service';
import { DafDrillService } from './lesson/daf-drill.service';
import { UebungService } from './uebung/uebung.service';
import { FortschrittService } from './fortschritt/fortschritt.service';

/**
 * A Student-role token that carries no `studentId` must be refused with 404
 * on every learning route, and must never reach the database.
 *
 * Prisma reads `{ studentId: undefined }` as "no filter", so a query meant
 * for one student would run over all of them. The services here are the REAL
 * ones; only Prisma is replaced, by a recorder that logs every query. "No
 * query" is therefore asserted at the database boundary, not inferred from a
 * mocked service.
 *
 * The route list is read from the controller's own metadata, so a route
 * added later is covered without editing this file.
 */

interface RecordedQuery {
  query: string;
  args: unknown;
}

/** Prisma stand-in: any `prisma.<model>.<method>(args)` is recorded and returns `[]`. */
function recordingPrisma() {
  const queries: RecordedQuery[] = [];
  const prisma = new Proxy(
    {},
    {
      get: (_target, model) =>
        new Proxy(
          {},
          {
            get: (_model, method) => (args?: unknown) => {
              queries.push({
                query: `${String(model)}.${String(method)}`,
                args,
              });
              return Promise.resolve([]);
            },
          },
        ),
    },
  ) as unknown as PrismaService;
  return { prisma, queries };
}

interface Route {
  handler: string;
  verb: 'get' | 'post';
  url: string;
}

function controllerRoutes(): Route[] {
  const proto = DafPortalController.prototype as unknown as Record<
    string,
    object
  >;
  const base = Reflect.getMetadata('path', DafPortalController) as string;
  const routes: Route[] = [];
  for (const handler of Object.getOwnPropertyNames(proto)) {
    if (handler === 'constructor') continue;
    const path = Reflect.getMetadata('path', proto[handler]) as
      | string
      | undefined;
    const method = Reflect.getMetadata('method', proto[handler]) as
      | RequestMethod
      | undefined;
    if (path === undefined || method === undefined) continue;
    const verb = RequestMethod[method].toLowerCase();
    if (verb !== 'get' && verb !== 'post') {
      throw new Error(`${handler}: add ${verb} support to this spec`);
    }
    routes.push({
      handler,
      verb,
      url: `/${base}/${path.replace(/:\w+/g, '1')}`,
    });
  }
  return routes;
}

const ROUTES = controllerRoutes();

const STUDENT_WITHOUT_CARD = { id: 20001, roles: ['Student'], companyId: 1 };
const MULTI_ROLE_WITHOUT_CARD = {
  id: 20002,
  roles: ['Student', 'Teacher'],
  companyId: 1,
};
const STAFF = { id: 20003, roles: ['Teacher'], companyId: 1 };
const STUDENT = {
  id: 20004,
  roles: ['Student'],
  companyId: 1,
  studentId: 10500,
};

describe('DafPortalController — a token without studentId', () => {
  let app: INestApplication;
  let server: Server;
  const { prisma, queries } = recordingPrisma();

  beforeAll(async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const drills = new DafDrillService(prisma, config);
    const moduleRef = await Test.createTestingModule({
      controllers: [DafPortalController],
      providers: [
        {
          provide: DafPortalReadService,
          useValue: new DafPortalReadService(prisma, config),
        },
        {
          provide: DafAttemptService,
          useValue: new DafAttemptService(prisma, drills),
        },
        { provide: DafDrillService, useValue: drills },
        { provide: UebungService, useValue: new UebungService(prisma, config) },
        {
          provide: FortschrittService,
          useValue: new FortschrittService(prisma),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same pipe as main.ts, so the order "guards, then validation" is real.
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

  function send(route: Route, user: object) {
    return request(server)
      [route.verb](route.url)
      .set('x-test-user', JSON.stringify(user))
      .send({});
  }

  it('reads every route from the controller (16 when written)', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(16);
    expect(ROUTES).toContainEqual({
      handler: 'getLevels',
      verb: 'get',
      url: '/student-portal/lernen/levels',
    });
  });

  it.each(ROUTES)(
    '$verb $url — Student token without studentId: 404, no query',
    async (route) => {
      const res = await send(route, STUDENT_WITHOUT_CARD);

      expect(res.status).toBe(404);
      expect((res.body as { message?: string }).message).toBe(
        'Talaba topilmadi',
      );
      expect(queries).toEqual([]);
    },
  );

  it.each(ROUTES)(
    '$verb $url — multi-role token without studentId: 404, no query',
    async (route) => {
      const res = await send(route, MULTI_ROLE_WITHOUT_CARD);

      expect(res.status).toBe(404);
      expect(queries).toEqual([]);
    },
  );

  // The role check still runs first: a staff token is told "not allowed",
  // not "student not found".
  it.each(ROUTES)('$verb $url — staff token: 403, no query', async (route) => {
    const res = await send(route, STAFF);

    expect(res.status).toBe(403);
    expect(queries).toEqual([]);
  });

  // Positive control: the refusal is about the missing id, not the route.
  it('GET levels with a studentId still answers, filtered by that student', async () => {
    const res = await request(server)
      .get('/student-portal/lernen/levels')
      .set('x-test-user', JSON.stringify(STUDENT));

    expect(res.status).toBe(200);
    const progress = queries.find(
      (q) => q.query === 'dafLessonProgress.findMany',
    );
    const args = progress?.args as { where?: { studentId?: unknown } };
    expect(args?.where?.studentId).toBe(10500);
  });
});
