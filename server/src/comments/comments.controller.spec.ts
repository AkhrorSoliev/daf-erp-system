import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards';
import { CommentsController } from './comments.controller';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const rolesOf = (handler: unknown) =>
  Reflect.getMetadata(ROLES_KEY, handler as object) as string[] | undefined;

describe('CommentsController — role gates', () => {
  const proto = CommentsController.prototype;

  // The old in-handler check ("only CEO/BD/Administrator may make a task")
  // went with task comments; now the route itself is the gate.
  it('create admits CEO, Branch Director and Administrator only', () => {
    expect(rolesOf(proto.create)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
  });

  it('reads and edits admit CEO, Branch Director and Administrator', () => {
    for (const handler of [
      proto.findByEntity,
      proto.getLatestComment,
      proto.update,
    ]) {
      expect(rolesOf(handler)).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
      ]);
    }
  });

  it('delete is CEO only', () => {
    expect(rolesOf(proto.delete)).toEqual(['CEO']);
  });

  it('every route runs RolesGuard', () => {
    for (const handler of [
      proto.create,
      proto.findByEntity,
      proto.getLatestComment,
      proto.update,
      proto.delete,
    ]) {
      expect(Reflect.getMetadata('__guards__', handler)).toContain(RolesGuard);
    }
  });

  // Tasks live under /tasks now; the comment routes for them are gone.
  it('has no task routes any more', () => {
    for (const name of [
      'getMyTasks',
      'getCreatedTasks',
      'updateAssigneeStatus',
    ]) {
      expect(name in proto).toBe(false);
    }
  });
});

// A stale client that still sends task fields gets a 400 from the global
// ValidationPipe (`whitelist` + `forbidNonWhitelisted`), not a silent plain
// comment.
describe('CreateCommentDto — task fields are gone', () => {
  const check = (body: object) =>
    validate(plainToInstance(CreateCommentDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  const base = { entityType: 'Student', entityId: '10001', content: 'x' };

  it('accepts a plain comment', async () => {
    expect(await check(base)).toHaveLength(0);
  });

  it.each([
    ['isTask', true],
    ['assigneeIds', [10001]],
    ['dueDate', '2026-10-08T05:00:00.000Z'],
    ['priority', 'HIGH'],
  ])('refuses %s', async (field, value) => {
    expect(await check({ ...base, [field]: value })).not.toHaveLength(0);
  });

  it('UpdateCommentDto refuses dueDate and priority too', async () => {
    const errors = await validate(
      plainToInstance(UpdateCommentDto, {
        dueDate: '2026-10-08',
        priority: 'LOW',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors).not.toHaveLength(0);
  });
});
