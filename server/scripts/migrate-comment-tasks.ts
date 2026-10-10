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
 * comment. With `--apply` each comment is written in its own transaction
 * (`lib/comment-task-apply.ts`) and stamped with `Comment.migratedTaskId`, so a
 * repeat run skips what is done; a comment that fails is logged, the run goes
 * on, and the exit code is 1. The run ends with a check: no comment task left
 * unmigrated, and as many of this run's tasks open as were mapped open.
 *
 * A «Dars bo'ldimi?» task takes its status from its UnmarkedLesson row (the
 * administrators who did not take it keep a PENDING copy for ever). If the same
 * lesson was asked again after the deploy, an OPEN task with its sourceKey
 * already exists and the partial unique index `task_open_source_unique` would
 * refuse a second one: the old comment then becomes a DONE row, "superseded".
 * A system comment its lesson no longer points at is closed too (`no-lesson`).
 * An open task is given its reminder and overdue notice (`TaskOutbox`).
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
import { planCommentTask, tryApplyCommentTask } from './lib/comment-task-apply';

const APPLY = process.argv.includes('--apply');

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

  const migrated: string[] = [];
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

      const m = await planCommentTask(prisma, c, branchId);
      const { task } = m;
      const notes =
        (m.noLesson ? '  [no-lesson]' : '') +
        (m.supersededBy ? `  (superseded by ${m.supersededBy})` : '');
      console.log(
        `${c.id} ${task.kind.padEnd(16)} ${task.status.padEnd(12)} ${m.participants.length} assignee(s) branch=${branchId ?? 'none'} → ${task.title.slice(0, 60)}${notes}`,
      );

      if (APPLY) {
        const r = await tryApplyCommentTask(prisma, c, m);
        if (!r.ok) {
          failed++;
          console.error(`FAILED ${c.id}: ${r.error}`);
          continue;
        }
        migrated.push(r.taskId);
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
    const [unmigrated, openNow] = await Promise.all([
      prisma.comment.count({ where: { isTask: true, migratedTaskId: null } }),
      prisma.task.count({
        where: { id: { in: migrated }, status: { in: [...OPEN_STATUSES] } },
      }),
    ]);
    const ok = unmigrated === 0 && openNow === open;
    console.log(
      `check: unmigrated=${unmigrated} (want 0) open=${openNow} (want ${open}) ${ok ? 'OK' : 'MISMATCH'}`,
    );
    if (!ok) process.exitCode = 1;
  }
});
