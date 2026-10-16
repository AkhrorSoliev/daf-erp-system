import { LeadOwnerTaskListener } from './lead-owner-task.listener';

const TASK = {
  id: 'T1',
  companyId: 1,
  title: "Qo'ng'iroq qilish",
  kind: 'MANUAL',
  authorId: 11,
  dueAt: null,
  status: 'NEW' as const,
  participants: [],
};

function setup(
  entity: { entityType: string | null; entityId: string | null } | null,
) {
  const prisma = {
    task: { findUnique: jest.fn().mockResolvedValue(entity) },
    lead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { prisma, listener: new LeadOwnerTaskListener(prisma as never) };
}

describe('LeadOwnerTaskListener', () => {
  it("counts a new task on the owner's lead as an action", async () => {
    const s = setup({ entityType: 'Lead', entityId: 'L1' });
    await s.listener.onAssigned({
      task: TASK,
      actorId: 11,
      userIds: [11],
      created: true,
    });
    expect(s.prisma.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'L1', ownerId: 11 }),
      }),
    );
  });

  it('ignores an assignee added to an existing task', async () => {
    const s = setup({ entityType: 'Lead', entityId: 'L1' });
    await s.listener.onAssigned({ task: TASK, actorId: 11, userIds: [12] });
    expect(s.prisma.task.findUnique).not.toHaveBeenCalled();
  });

  it('counts a status change and a comment on the task', async () => {
    const s = setup({ entityType: 'Lead', entityId: 'L1' });
    await s.listener.onStatus({
      task: TASK,
      actorId: 11,
      from: 'NEW',
      to: 'IN_PROGRESS',
    });
    await s.listener.onCommented({
      task: TASK,
      actorId: 11,
      text: 'gaplashdim',
    });
    expect(s.prisma.lead.updateMany).toHaveBeenCalledTimes(2);
  });

  it('ignores a task on a student or with no record', async () => {
    const s = setup({ entityType: 'Student', entityId: '10500' });
    await s.listener.onStatus({
      task: TASK,
      actorId: 11,
      from: 'NEW',
      to: 'IN_PROGRESS',
    });
    expect(s.prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});
