import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { LessonReschedulesController } from './lesson-reschedules.controller';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { RolesGuard } from '../common/guards';

describe('LessonReschedulesController (e2e validation)', () => {
  let app: INestApplication;
  const findAvailableRooms = jest.fn().mockResolvedValue([
    { id: 'r-1', name: 'Xona 1' },
  ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LessonReschedulesController],
      providers: [
        { provide: LessonReschedulesService, useValue: { findAvailableRooms } },
        { provide: APP_GUARD, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Stub @CurrentUser to avoid requiring real JWT — manually attach req.user
    app.use((req: any, _res: any, next: any) => {
      req.user = { companyId: 1, id: 99, roles: ['CEO'] };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a well-formed query', async () => {
    const res = await request(app.getHttpServer())
      .get('/lesson-reschedules/available-rooms')
      .query({
        groupId: 'group-1',
        date: '2026-05-12',
        startTime: '10:00',
        endTime: '11:30',
      });
    if (res.status !== 200) console.log('REJECTED', res.status, res.body);
    expect(res.status).toBe(200);
  });

  it.each([
    {
      name: 'CUID-style group id with underscore',
      query: {
        groupId: 'cm5a1b2c3d4e5f6',
        date: '2026-05-12',
        startTime: '10:00',
        endTime: '11:30',
      },
    },
    {
      name: 'real-world short ID',
      query: {
        groupId: 'g_xyz',
        date: '2026-05-04',
        startTime: '14:00',
        endTime: '15:30',
      },
    },
    {
      name: 'midnight start',
      query: {
        groupId: 'g_xyz',
        date: '2026-05-04',
        startTime: '00:00',
        endTime: '01:30',
      },
    },
    {
      name: '23:30 end',
      query: {
        groupId: 'g_xyz',
        date: '2026-05-04',
        startTime: '22:00',
        endTime: '23:30',
      },
    },
  ])('accepts $name', async ({ query }) => {
    const res = await request(app.getHttpServer())
      .get('/lesson-reschedules/available-rooms')
      .query(query);
    if (res.status !== 200) console.log('REJECTED', query, res.status, res.body);
    expect(res.status).toBe(200);
  });
});
