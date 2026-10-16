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
  entity: {
    entityType: string | null;
    entityId: string | null;
    recurrenceId?: string | null;
  } | null,
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

  describe('a recurring task', () => {
    const RECURRING = {
      entityType: 'Lead',
      entityId: 'L1',
      recurrenceId: 'R1',
    };

    it("does not count the rule's automatic run as the owner's action", async () => {
      const s = setup(RECURRING);
      // The runner emits task.assigned (created) as the rule's author.
      await s.listener.onAssigned({
        task: TASK,
        actorId: 11,
        userIds: [11],
        created: true,
      });
      expect(s.prisma.task.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ recurrenceId: true }),
        }),
      );
      expect(s.prisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it("still counts the owner's own status change and comment", async () => {
      const s = setup(RECURRING);
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

    it('counts a one-off task created by the owner as before', async () => {
      const s = setup({ ...RECURRING, recurrenceId: null });
      await s.listener.onAssigned({
        task: TASK,
        actorId: 11,
        userIds: [11],
        created: true,
      });
      expect(s.prisma.lead.updateMany).toHaveBeenCalledTimes(1);
    });
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
