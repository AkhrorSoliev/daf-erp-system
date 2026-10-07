/**
 * One-off: moves the comment tasks (`Comment.isTask` + `CommentAssignee`) onto
 * `Task` rows (spec 2026-10-07 §10). Run once, right after the deploy that
 * ships the tasks module and outside working hours — until it has run, /tasks
 * is empty.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/migrate-comment-tasks.ts [--apply]
 *
 * Without `--apply` it is a dry run: the connection is read-only (the script
 * checks that it took effect and stops otherwise) and it prints one line per
 * comment. With `--apply` each comment is written in its own transaction and
 * stamped with `Comment.migratedTaskId`, so a repeat run skips what is done; a
 * comment that fails is logged, the run goes on, and the exit code is 1.
 *
 * A «Dars bo'ldimi?» task takes its status from its UnmarkedLesson row (the
 * administrators who did not take it keep a PENDING copy for ever). If the same
 * lesson was asked again after the deploy, an OPEN task with its sourceKey
 * already exists and the partial unique index `task_open_source_unique` would
 * refuse a second one: the old comment then becomes a DONE row, "superseded".
 *
 * This file is one of the three allowed writers of `Task` rows (see the model's
 * comment in schema.prisma); the scan in `task-write.single-source.spec.ts`
 * covers `src/` only.
 */
import { OPEN_STATUSES } from '../src/tasks/task-transitions';
import {
  tryResolveStudentBranchId,
  tryResolveUserBranchId,
} from '../src/common/finance/resolve-branch';
import { printHeader, run } from './lib/check-cli';
import { mapCommentTask } from './lib/comment-task-map';

const APPLY = process.argv.includes('--apply');
/** Neon cold start: the default 5 s interactive timeout is too tight. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

// check-cli has already loaded .env; its makePrisma() reads the variable later.
if (!APPLY && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL);
}

run(async (prisma) => {
  printHeader(`Comment tasks → Task (${APPLY ? 'APPLY' : 'dry run'})`);
  if (!APPLY) {
    const [ro] = await prisma.$queryRaw<
      { default_transaction_read_only: string }[]
    >`SHOW default_transaction_read_only`;
    if (ro?.default_transaction_read_only !== 'on') {
      throw new Error('Read-only connection was not established — stopping');
    }
  }

  const rows = await prisma.comment.findMany({
    where: { isTask: true, migratedTaskId: null },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      content: true,
      isSystem: true,
      dueDate: true,
      priority: true,
      authorId: true,
      companyId: true,
      createdAt: true,
      assignees: {
        select: { userId: true, status: true, seenAt: true, doneAt: true },
      },
      unmarkedLesson: {
        select: {
          id: true,
          groupId: true,
          date: true,
          claimedById: true,
          status: true,
          decidedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`candidates: ${rows.length}`);

  let open = 0;
  let done = 0;
  let failed = 0;
  for (const c of rows) {
    try {
      let branchId: number | null = null;
      if (c.entityType === 'Student') {
        branchId = await tryResolveStudentBranchId(
          prisma,
          Number(c.entityId),
          c.companyId,
        );
      } else if (c.entityType === 'Group') {
        branchId =
          (
            await prisma.group.findFirst({
              where: { id: c.entityId },
              select: { branchId: true },
            })
          )?.branchId ?? null;
      } else if (c.entityType === 'Lead') {
        branchId =
          (
            await prisma.lead.findFirst({
              where: { id: c.entityId },
              select: { branchId: true },
            })
          )?.branchId ?? null;
      } else if (c.entityType === 'User') {
        branchId = await tryResolveUserBranchId(prisma, Number(c.entityId));
      }

      const m = mapCommentTask(c, branchId);
      let task = m.task;
      let note = '';
      if (task.sourceKey && task.status !== 'DONE') {
        const holder = await prisma.task.findFirst({
          where: {
            sourceKey: task.sourceKey,
            status: { in: [...OPEN_STATUSES] },
          },
          select: { id: true },
        });
        if (holder) {
          task = { ...task, status: 'DONE', closedAt: task.createdAt };
          note = `  (superseded by ${holder.id})`;
        }
      }
      console.log(
        `${c.id} ${task.kind.padEnd(16)} ${task.status.padEnd(12)} ${m.participants.length} assignee(s) → ${task.title.slice(0, 60)}${note}`,
      );

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          const t = await tx.task.create({
            data: {
              ...task,
              participants: { create: m.participants },
              events: { create: m.events },
            },
            select: { id: true },
          });
          await tx.comment.update({
            where: { id: c.id },
            data: { migratedTaskId: t.id },
          });
          await tx.notification.updateMany({
            where: { commentId: c.id },
            data: { taskId: t.id },
          });
          // Only a lesson no task points at yet: a re-asked question's lesson
          // already carries the new one.
          if (c.unmarkedLesson) {
            await tx.unmarkedLesson.updateMany({
              where: { id: c.unmarkedLesson.id, taskId: null },
              data: { taskId: t.id },
            });
          }
        }, TX_OPTIONS);
      }
      if (task.status === 'DONE') done++;
      else open++;
    } catch (e) {
      failed++;
      console.error(
        `FAILED ${c.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  console.log(`open: ${open}, done: ${done}, failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;

  if (APPLY) {
    const [tasks, comments] = await Promise.all([
      prisma.task.count(),
      prisma.comment.count({ where: { isTask: true } }),
    ]);
    console.log(
      `check: Task=${tasks} isTask comments=${comments} ${tasks >= comments ? 'OK' : 'MISMATCH'}`,
    );
  }
});
