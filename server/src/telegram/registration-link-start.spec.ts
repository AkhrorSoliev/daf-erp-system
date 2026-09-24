import { TelegramService } from './telegram.service';

/**
 * `/start` with a student-group, mock-exam or student link runs its lookups
 * under `ctx.session.processing`, and every way out releases the flag, a throw
 * included.
 *
 * Telegraf saves the session even when a handler throws, and the `/start`
 * middleware ignores a chat whose flag is set, re-saving it so its 24-hour TTL
 * restarts on every try. A lookup that threw with the flag set therefore muted
 * `/start` for that person for as long as they kept trying.
 *
 * As in `employee-link-start.spec.ts`, the methods run on a bare prototype
 * instance.
 */
describe('TelegramService — /start registration links always release their lock', () => {
  const FERGANA = 7;

  const GROUP = {
    id: '3f6c2a8e-5b1d-4c7e-9a0f-2d8b4e6c1a93',
    name: 'A1-07',
    lessonStartTime: '14:00',
    lessonEndTime: '15:30',
    days: 'odd',
    exactDays: ['monday', 'wednesday', 'friday'],
    room: { name: '12-xona' },
    teachers: [
      { teacher: { id: 10010, firstName: 'Aziz', lastName: 'Qodirov' } },
    ],
  };

  const EXAM = {
    id: '8d1e4b27-0c3a-4f9e-b6d5-7a2c9e1f4b08',
    title: 'Goethe A1',
  };

  function makeService() {
    const inst = Object.create(TelegramService.prototype);
    inst.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    inst.prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: FERGANA }),
        findUnique: jest.fn().mockResolvedValue({ id: FERGANA }),
      },
      group: { findFirst: jest.fn().mockResolvedValue(GROUP) },
      mockExam: { findFirst: jest.fn().mockResolvedValue(EXAM) },
    };
    return inst;
  }

  function makeCtx() {
    const ctx: any = {
      session: { processing: false, data: {} as Record<string, unknown> },
      reply: jest.fn().mockResolvedValue(undefined),
      scene: { enter: jest.fn() },
    };
    // The scene's own text/contact/photo handlers read the same flag, so it
    // must already be released when the scene takes over.
    ctx.scene.enter.mockImplementation(async () => {
      ctx.lockHeldAtEnter = ctx.session.processing;
    });
    return ctx;
  }

  /** Resolves `value`, noting whether the lock was held when it was asked. */
  function probe(ctx: any, value: unknown) {
    return async () => {
      ctx.lockHeldAtLookup = ctx.session.processing;
      return value;
    };
  }

  const outage = () => new Error('Connection terminated unexpectedly');

  describe('student_<branch>_group_<group>', () => {
    const LINK = `student_${FERGANA}_group_${GROUP.id}`;

    it.each(['student_7', 'mock_abc123', ''])(
      'leaves %p to the other kinds',
      async (payload) => {
        const service = makeService();
        const ctx = makeCtx();

        const handled = await service.startStudentGroupRegistration(
          ctx,
          payload,
        );

        expect(handled).toBe(false);
        expect(service.prisma.branch.findFirst).not.toHaveBeenCalled();
        expect(ctx.reply).not.toHaveBeenCalled();
        expect(ctx.scene.enter).not.toHaveBeenCalled();
      },
    );

    it('enters student registration with the group, looking both up under the lock', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.group.findFirst.mockImplementation(probe(ctx, GROUP));

      const handled = await service.startStudentGroupRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(service.prisma.branch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FERGANA, deletedAt: null, status: 'ACTIVE' },
        }),
      );
      expect(service.prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GROUP.id, branchId: FERGANA, deletedAt: null },
        }),
      );
      expect(ctx.lockHeldAtLookup).toBe(true);
      expect(ctx.session.data).toEqual({
        branchId: FERGANA,
        groupId: GROUP.id,
        groupName: 'A1-07',
        teacherId: 10010,
        teacherName: 'Aziz Qodirov',
        lessonStartTime: '14:00',
        lessonEndTime: '15:30',
        days: 'odd',
        exactDays: ['monday', 'wednesday', 'friday'],
        roomName: '12-xona',
      });
      expect(ctx.scene.enter).toHaveBeenCalledWith('student-registration');
      expect(ctx.lockHeldAtEnter).toBe(false);
      expect(ctx.session.processing).toBe(false);
    });

    it('answers an unknown branch without looking for the group', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.branch.findFirst.mockResolvedValueOnce(null);

      const handled = await service.startStudentGroupRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Filial topilmadi. Administrator bilan bog'laning.",
      );
      expect(service.prisma.group.findFirst).not.toHaveBeenCalled();
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('answers an unknown group', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.group.findFirst.mockResolvedValueOnce(null);

      const handled = await service.startStudentGroupRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Guruh topilmadi. Administrator bilan bog'laning.",
      );
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it.each(['branch', 'group'] as const)(
      'releases the lock when the %s lookup fails, and lets the error through',
      async (model) => {
        const service = makeService();
        const ctx = makeCtx();
        const error = outage();
        service.prisma[model].findFirst.mockRejectedValueOnce(error);

        await expect(
          service.startStudentGroupRegistration(ctx, LINK),
        ).rejects.toBe(error);

        expect(ctx.session.processing).toBe(false);
        expect(ctx.scene.enter).not.toHaveBeenCalled();
      },
    );
  });

  describe('mock_<payload>', () => {
    const LINK = 'mock_k3x9p2';

    it.each(['student_7', `student_7_group_${GROUP.id}`, ''])(
      'leaves %p to the other kinds',
      async (payload) => {
        const service = makeService();
        const ctx = makeCtx();

        const handled = await service.startMockExamRegistration(ctx, payload);

        expect(handled).toBe(false);
        expect(service.prisma.mockExam.findFirst).not.toHaveBeenCalled();
        expect(ctx.reply).not.toHaveBeenCalled();
        expect(ctx.scene.enter).not.toHaveBeenCalled();
      },
    );

    it('enters mock-exam registration with the exam, looked up under the lock', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.mockExam.findFirst.mockImplementation(probe(ctx, EXAM));

      const handled = await service.startMockExamRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(service.prisma.mockExam.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { botStartPayload: 'k3x9p2', deletedAt: null },
        }),
      );
      expect(ctx.lockHeldAtLookup).toBe(true);
      expect(ctx.session.data).toEqual({ examId: EXAM.id });
      expect(ctx.scene.enter).toHaveBeenCalledWith('mock-exam-registration');
      expect(ctx.lockHeldAtEnter).toBe(false);
      expect(ctx.session.processing).toBe(false);
    });

    it('answers a link with nothing after the prefix without a lookup', async () => {
      const service = makeService();
      const ctx = makeCtx();

      const handled = await service.startMockExamRegistration(ctx, 'mock_');

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith("Noto'g'ri havola.");
      expect(service.prisma.mockExam.findFirst).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('answers an unknown exam', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.mockExam.findFirst.mockResolvedValueOnce(null);

      const handled = await service.startMockExamRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Imtihon topilmadi yoki havola eskirgan. Administrator bilan bog'laning.",
      );
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('releases the lock when the exam lookup fails, and lets the error through', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const error = outage();
      service.prisma.mockExam.findFirst.mockRejectedValueOnce(error);

      await expect(service.startMockExamRegistration(ctx, LINK)).rejects.toBe(
        error,
      );

      expect(ctx.session.processing).toBe(false);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
    });
  });

  describe('student_<branch>', () => {
    const LINK = `student_${FERGANA}`;

    it.each(['mock_k3x9p2', 'employee_7', ''])(
      'leaves %p to the other kinds',
      async (payload) => {
        const service = makeService();
        const ctx = makeCtx();

        const handled = await service.startStudentRegistration(ctx, payload);

        expect(handled).toBe(false);
        expect(service.prisma.branch.findUnique).not.toHaveBeenCalled();
        expect(ctx.reply).not.toHaveBeenCalled();
        expect(ctx.scene.enter).not.toHaveBeenCalled();
      },
    );

    it('enters student registration with the branch, looked up under the lock', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.branch.findUnique.mockImplementation(
        probe(ctx, { id: FERGANA }),
      );

      const handled = await service.startStudentRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(service.prisma.branch.findUnique).toHaveBeenCalledWith({
        where: { id: FERGANA },
      });
      expect(ctx.lockHeldAtLookup).toBe(true);
      expect(ctx.session.data).toEqual({ branchId: FERGANA });
      expect(ctx.scene.enter).toHaveBeenCalledWith('student-registration');
      expect(ctx.lockHeldAtEnter).toBe(false);
      expect(ctx.session.processing).toBe(false);
    });

    it.each(['student_', 'student_abc'])(
      'answers %p as a bad link without a lookup',
      async (payload) => {
        const service = makeService();
        const ctx = makeCtx();

        const handled = await service.startStudentRegistration(ctx, payload);

        expect(handled).toBe(true);
        expect(ctx.reply).toHaveBeenCalledWith(
          "Noto'g'ri havola. Administrator bilan bog'laning.",
        );
        expect(service.prisma.branch.findUnique).not.toHaveBeenCalled();
        expect(ctx.session.processing).toBe(false);
      },
    );

    it('answers an unknown branch', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.branch.findUnique.mockResolvedValueOnce(null);

      const handled = await service.startStudentRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Filial topilmadi. Administrator bilan bog'laning.",
      );
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('releases the lock when the branch lookup fails, and lets the error through', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const error = outage();
      service.prisma.branch.findUnique.mockRejectedValueOnce(error);

      await expect(service.startStudentRegistration(ctx, LINK)).rejects.toBe(
        error,
      );

      expect(ctx.session.processing).toBe(false);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
    });
  });

  it('a resume after the channel join that fails leaves /start usable', async () => {
    // `resumeAfterJoin` answers a failed resume with "send /start". That
    // advice only works if the failure released the lock, or `/start` would
    // ignore the very message it asked for.
    const service = makeService();
    const ctx = makeCtx();
    ctx.session.pendingStartPayload = `student_${FERGANA}`;
    service.prisma.branch.findUnique.mockRejectedValueOnce(outage());
    service.startFlow = (c: unknown, payload: string) =>
      service.startStudentRegistration(c, payload);

    await service.resumeAfterJoin(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      'Davom etish uchun /start yuboring.',
    );
    expect(ctx.session.processing).toBe(false);
  });
});
