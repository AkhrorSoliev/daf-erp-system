import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

/**
 * `PATCH /expenses/:id` used to take `Partial<CreateExpenseDto>`, which
 * TypeScript emits as `Object`; the global ValidationPipe skips `Object`, so no
 * field of the body was checked. The controller and the pipe here are real;
 * only the service is a mock, and every 400 must stop before it.
 */
describe('PATCH /expenses/:id — the body is validated', () => {
  let app: INestApplication;
  let server: Server;
  const update = jest.fn().mockResolvedValue({});

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        { provide: ExpensesService, useValue: { update } },
        { provide: PrismaService, useValue: {} },
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
    // Stands in for JwtStrategy.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 10001, companyId: 1001 };
      next();
    });
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => update.mockClear());

  const patch = (body: object) =>
    request(server).patch('/expenses/exp-1').send(body);

  it.each([
    ['a negative amount', { amount: -5 }],
    ['a non-numeric amount', { amount: 'abc' }],
    ['a null amount', { amount: null }],
    ['an unknown field', { amount: 1000, foo: 'bar' }],
    ['an unknown category', { category: 'PARTY' }],
    ['a null branch', { branchId: null }],
    ['a non-integer recipient', { relatedUserId: 'x' }],
  ])('refuses %s with 400', async (_label, body) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  // What `expense-form-dialog.tsx` sends on every save, `relatedUserId: null`
  // included.
  it('accepts the expense form payload', async () => {
    const body = {
      category: 'RENT',
      paymentMethod: 'CASH',
      amount: 400000,
      description: 'Ijara',
      date: '2026-10-01',
      relatedUserId: null,
    };

    const res = await patch(body);

    expect(res.status).toBe(200);
    const dto = update.mock.calls[0][1] as UpdateExpenseDto;
    expect(dto).toBeInstanceOf(UpdateExpenseDto);
    expect(dto).toEqual(body);
    expect(update).toHaveBeenCalledWith('exp-1', dto, 10001, 1001);
  });

  // What `salary-advance-dialog.tsx` sends when an advance is edited.
  it('accepts the advance dialog payload', async () => {
    const body = {
      paymentMethod: 'CARD',
      amount: 500000,
      description: 'Avans',
      date: '2026-10-05',
    };

    const res = await patch(body);

    expect(res.status).toBe(200);
    expect(update.mock.calls[0][1]).toEqual(body);
  });
});
