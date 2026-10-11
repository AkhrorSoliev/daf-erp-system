import { createCopiesTx } from './task-create';
import {
  RECURRING_PHOTO_MESSAGE,
  TaskRecurrencesService,
} from './task-recurrences.service';

const make = () => ({
  task: { create: jest.fn().mockResolvedValue({ id: 'T1' }) },
});
const base = {
  companyId: 1,
  branchId: null,
  authorId: 30,
  dueAt: null,
  batchId: null,
  watcherIds: [],
};

it('createCopiesTx writes requiresPhoto only when asked', async () => {
  const tx = make();
  await createCopiesTx(
    tx as never,
    { ...base, dto: { title: 'A', assigneeIds: [40], requiresPhoto: true } },
    [[40]],
    jest.fn(),
  );
  await createCopiesTx(
    tx as never,
    { ...base, dto: { title: 'B', assigneeIds: [40] } },
    [[40]],
    jest.fn(),
  );
  expect(tx.task.create.mock.calls[0][0].data.requiresPhoto).toBe(true);
  expect(tx.task.create.mock.calls[1][0].data.requiresPhoto).toBe(false);
});

it('a recurring task cannot require a photo (400 before anything is read)', async () => {
  const svc = new TaskRecurrencesService({} as never, {} as never, {} as never);
  await expect(
    svc.create(
      {
        title: 'X',
        assigneeIds: [40],
        requiresPhoto: true,
        recurrence: { freq: 'DAILY', dueTime: '10:00' },
      } as never,
      { userId: 30 } as never,
    ),
  ).rejects.toThrow(RECURRING_PHOTO_MESSAGE);
});
