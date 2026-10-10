import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { TaskOutboxService } from './task-outbox.service';

// Split off tasks.service.spec.ts (over the 500-line rule): a step write and
// the read that answers it share one transaction.
function makeRow() {
  return {
    id: 't1',
    companyId: 1,
    branchId: 1,
    kind: 'MANUAL',
    title: 'X',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dueAt: null,
    authorId: 30,
    entityType: null,
    entityId: null,
    requiresPhoto: false,
    batchId: null,
    sourceKey: null,
    claimedById: null,
    returnedCount: 0,
    startedAt: null,
    reviewRequestedAt: null,
    closedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    description: null,
    lastReturnedAt: null,
    cancelReason: null,
    author: { id: 30, firstName: 'A', lastName: 'B', photo: null },
    participants: [
      {
        userId: 40,
        role: 'ASSIGNEE',
        seenAt: null,
        user: { id: 40, firstName: 'T', lastName: 'U', photo: null },
      },
    ],
    _count: { steps: 1, events: 1 },
    steps: [],
    unmarkedLesson: null,
  };
}

const actor = {
  userId: 40,
  companyId: 1,
  roleIds: [4],
  roleNames: ['Teacher'],
  scope: { kind: 'branches' as const, branchIds: [1] },
  headerBranchId: 1,
};
// The author may also add and delete steps.
const author = {
  ...actor,
  userId: 30,
  roleIds: [3],
  roleNames: ['Administrator'],
};

describe('a step write and its answering read are one transaction', () => {
  let service: TasksService;
  let prisma: any;
  /** What the open transaction wrote; kept only if the callback resolves. */
  let staged: string[];
  let committed: string[];
  let insideTx: boolean;
  let readsInsideTx: boolean[];
  let failTheSecondRead: boolean;

  beforeEach(async () => {
    staged = [];
    committed = [];
    insideTx = false;
    readsInsideTx = [];
    failTheSecondRead = false;
    const write = (name: string) =>
      jest.fn(() => {
        staged.push(name);
        return Promise.resolve({ count: 1 });
      });
    prisma = {
      task: {
        // 1st: the access check of the write; 2nd: the read that answers it.
        findFirst: jest.fn(() => {
          readsInsideTx.push(insideTx);
          if (failTheSecondRead && readsInsideTx.length === 2) {
            return Promise.reject(new Error('db down'));
          }
          return Promise.resolve(makeRow());
        }),
      },
      taskStep: {
        create: write('step.create'),
        update: write('step.update'),
        deleteMany: write('step.delete'),
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          taskId: 't1',
          title: 'Old',
          doneAt: null,
        }),
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 1 } }),
      },
      taskEvent: { create: write('event.create') },
      // The real thing rolls a failed callback back; so does this.
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        insideTx = true;
        staged = [];
        try {
          const out = await cb(prisma);
          committed.push(...staged);
          return out;
        } finally {
          insideTx = false;
        }
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: HolidaysService,
          useValue: { buildHolidayDateSet: jest.fn() },
        },
        { provide: TaskOutboxService, useValue: { schedule: jest.fn() } },
      ],
    }).compile();
    service = mod.get(TasksService);
  });

  const calls: [string, (s: TasksService) => Promise<unknown>][] = [
    ['updateStep', (s) => s.updateStep('t1', 's1', { done: true }, actor)],
    ['addStep', (s) => s.addStep('t1', 'Yangi qadam', author)],
    ['deleteStep', (s) => s.deleteStep('t1', 's1', author)],
  ];

  it.each(calls)(
    '%s reads the task inside the transaction',
    async (_n, run) => {
      await run(service);
      expect(readsInsideTx).toEqual([true, true]);
      expect(committed).toContain('event.create');
    },
  );

  it.each(calls)(
    '%s: a failing read rolls the write back, so an error never follows a saved write',
    async (_n, run) => {
      failTheSecondRead = true;
      await expect(run(service)).rejects.toThrow('db down');
      expect(staged.length).toBeGreaterThan(0); // the write did run...
      expect(committed).toEqual([]); // ...and was not kept
    },
  );
});
