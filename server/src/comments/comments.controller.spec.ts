import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { CommentsController } from './comments.controller';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

describe('CommentsController — route access', () => {
  const proto = CommentsController.prototype;
  const READS = ['findByEntity', 'getLatestComment'] as const;

  // The old in-handler check ("only CEO/BD/Administrator may make a task")
  // went with task comments; now the route itself is the gate.
  it.each(['create', 'update'] as const)(
    '%s is gated by the comment writing capability',
    (name) => {
      expect(routeAccess(CommentsController, name)).toEqual({
        kind: 'can',
        keys: ['comments.write'],
      });
    },
  );

  // Reading a thread is part of looking at the record it hangs off, so every
  // screen that shows such a thread keeps it open.
  it.each(READS)('%s is open to every screen that shows a thread', (name) => {
    expect(routeAccess(CommentsController, name)).toEqual({
      kind: 'can',
      keys: [
        'comments.write',
        'students.details',
        'groups.manage',
        'teachers.view',
        'employees.view',
      ],
    });
  });

  it.each(['create', 'update', ...READS] as const)(
    '%s admits the CEO, Branch Director and Administrator by default',
    (name) => {
      expect(defaultRolesOf(CommentsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('delete is gated by the comment moderation capability, which only the CEO holds by default', () => {
    expect(routeAccess(CommentsController, 'delete')).toEqual({
      kind: 'can',
      keys: ['comments.delete'],
    });
    expect(defaultRolesOf(CommentsController, 'delete')).toEqual(['CEO']);
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
