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

  function taskDto(overrides: Partial<CreateCommentDto> = {}): CreateCommentDto {
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
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: true, assigneeIds: [10001] }),
      1,
      1,
    );
  });

  it('Branch Director keeps task fields when creating a task comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Branch Director']);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: true, assigneeIds: [10001] }),
      1,
      1,
    );
  });

  // The Outreach Center (/outreach) is operated mainly by Administrators —
  // they MUST be able to schedule callback tasks. Previously CEO+BD only.
  it('Administrator keeps task fields when creating a task comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Administrator']);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: true, assigneeIds: [10001] }),
      1,
      1,
    );
  });

  it('Cashier cannot create task — falls back to plain comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Cashier']);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: false, assigneeIds: undefined }),
      1,
      1,
    );
  });

  it('Teacher cannot create task — falls back to plain comment', async () => {
    const dto = taskDto();
    await controller.create(dto, 1, 1, ['Teacher']);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ isTask: false, assigneeIds: undefined }),
      1,
      1,
    );
  });
});
