import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

describe('CommentsController.create — task permission gate', () => {
  let controller: CommentsController;
  const service = { create: jest.fn().mockResolvedValue({ id: 'c1' }) };

  beforeEach(async () => {
    service.create.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: service }],
    }).compile();
    controller = module.get(CommentsController);
  });

  function taskDto(
    overrides: Partial<CreateCommentDto> = {},
  ): CreateCommentDto {
    return {
      entityType: 'Student',
      entityId: '10100',
      content: 'call back',
      isTask: true,
      dueDate: new Date().toISOString(),
      priority: 'MEDIUM' as any,
      assigneeIds: [10001],
      ...overrides,
    } as CreateCommentDto;
  }

  it('CEO keeps task fields when creating a task comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['CEO']);
    // roles are forwarded now — the entity guard needs them to route a pure
    // teacher to the group-assignment check instead of the branch one.
    const FORWARDED_ROLES = ['CEO'];
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: true, assigneeIds: [10001] }),
      1,
      1,
      FORWARDED_ROLES,
    );
  });

  it('Branch Director keeps task fields when creating a task comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Branch Director']);
    // roles are forwarded now — the entity guard needs them to route a pure
    // teacher to the group-assignment check instead of the branch one.
    const FORWARDED_ROLES = ['Branch Director'];
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: true, assigneeIds: [10001] }),
      1,
      1,
      FORWARDED_ROLES,
    );
  });

  // The Outreach Center (/outreach) is operated mainly by Administrators —
  // they MUST be able to schedule callback tasks. Previously CEO+BD only.
  it('Administrator keeps task fields when creating a task comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Administrator']);
    // roles are forwarded now — the entity guard needs them to route a pure
    // teacher to the group-assignment check instead of the branch one.
    const FORWARDED_ROLES = ['Administrator'];
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: true, assigneeIds: [10001] }),
      1,
      1,
      FORWARDED_ROLES,
    );
  });

  it('Cashier cannot create task — falls back to plain comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Cashier']);
    // roles are forwarded now — the entity guard needs them to route a pure
    // teacher to the group-assignment check instead of the branch one.
    const FORWARDED_ROLES = ['Cashier'];
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: false, assigneeIds: undefined }),
      1,
      1,
      FORWARDED_ROLES,
    );
  });

  it('Teacher cannot create task — falls back to plain comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Teacher']);
    // roles are forwarded now — the entity guard needs them to route a pure
    // teacher to the group-assignment check instead of the branch one.
    const FORWARDED_ROLES = ['Teacher'];
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: false, assigneeIds: undefined }),
      1,
      1,
      FORWARDED_ROLES,
    );
  });
});
