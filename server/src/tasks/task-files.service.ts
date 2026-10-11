import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import type { Prisma, TaskEventVia, TaskFileKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, type TaskActor } from './tasks.service';
import { TaskFileStorage } from './task-file-storage';
import { TASK_EVENTS } from './task-events';
import { TASK_EVENT_SELECT, type TaskEventRow } from './task-select';
import { hasFreshPhoto } from './task-status-writes';
import {
  DELETE_REFUSED_MESSAGE,
  FILES_OFF_MESSAGE,
  FILE_NOT_FOUND_MESSAGE,
  PURGE_AFTER_DAYS,
  PURGE_BATCH,
  UPLOAD_REFUSED_MESSAGE,
  checkTaskFile,
  safeFileName,
  taskFileKey,
} from './task-file-rules';

const FILE_SELECT = {
  id: true,
  key: true,
  name: true,
  size: true,
  mime: true,
  kind: true,
  durationSec: true,
  via: true,
  createdAt: true,
  uploadedById: true,
  uploadedBy: {
    select: { id: true, firstName: true, lastName: true, photo: true },
  },
} satisfies Prisma.TaskFileSelect;
type FileRow = Prisma.TaskFileGetPayload<{ select: typeof FILE_SELECT }>;

export type TaskFileView = {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: TaskFileKind;
  durationSec: number | null;
  via: TaskEventVia;
  createdAt: Date;
  uploadedBy: FileRow['uploadedBy'];
  canDelete: boolean;
  url: string;
  downloadUrl: string;
};

/**
 * Task files (spec §3.5, ADR-0086). The server stores every upload (website
 * multipart and Telegram alike) after reading its type from the bytes, and
 * hands out 10-minute links after the same access check as the task. A file is
 * a feed row (`FILE` / `VOICE`) and a comment's notice; a delete is soft.
 * Never log a link or a key: a signed link carries the access key id.
 */
@Injectable()
export class TaskFilesService {
  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private tasks: TasksService,
    private storage: TaskFileStorage,
  ) {}

  config(): { filesEnabled: boolean } {
    return { filesEnabled: this.storage.enabled };
  }

  /** Every call re-checks view access, so a link is never given to a stranger. */
  async list(
    taskId: string,
    actor: TaskActor,
  ): Promise<{
    data: TaskFileView[];
    hasFreshPhoto: boolean;
    enabled: boolean;
  }> {
    const { row, access } = await this.tasks.loadForAccess(
      this.prisma,
      taskId,
      actor,
    );
    const enabled = this.storage.enabled;
    const [files, fresh] = await Promise.all([
      enabled
        ? this.prisma.taskFile.findMany({
            where: { taskId, deletedAt: null },
            select: FILE_SELECT,
            orderBy: { createdAt: 'asc' },
            take: 200,
          })
        : [],
      row.requiresPhoto ? hasFreshPhoto(this.prisma, row) : false,
    ]);
    const data = await Promise.all(
      files.map((f) => this.view(f, actor.userId, access.canManage)),
    );
    return { data, hasFreshPhoto: fresh, enabled };
  }

  async upload(
    taskId: string,
    input: { buffer: Buffer; name?: string; durationSec?: number },
    actor: TaskActor,
  ): Promise<{ file: TaskFileView; event: TaskEventRow }> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(FILES_OFF_MESSAGE);
    }
    // 404 for a task the caller cannot see; watchers view and comment only.
    const { row, access } = await this.tasks.loadForAccess(
      this.prisma,
      taskId,
      actor,
    );
    if (!access.canWork && !access.canManage) {
      throw new ForbiddenException(UPLOAD_REFUSED_MESSAGE);
    }
    const { mime, ext, kind } = checkTaskFile(input);
    const name = safeFileName(input.name, ext);
    const key = taskFileKey(row.companyId, row.id, ext);
    const via = actor.via ?? 'WEB';
    await this.storage.put(key, input.buffer, mime);
    let saved: { file: FileRow; event: TaskEventRow };
    try {
      saved = await this.prisma.$transaction(async (tx) => {
        const file = await tx.taskFile.create({
          data: {
            taskId,
            key,
            name,
            size: input.buffer.length,
            mime,
            kind,
            durationSec: kind === 'VOICE' ? (input.durationSec ?? null) : null,
            uploadedById: actor.userId,
            via,
          },
          select: FILE_SELECT,
        });
        const event = await tx.taskEvent.create({
          data: {
            taskId,
            type: kind === 'VOICE' ? 'VOICE' : 'FILE',
            actorId: actor.userId,
            text: name,
            fileId: file.id,
            via,
          },
          select: TASK_EVENT_SELECT,
        });
        return { file, event };
      });
    } catch (err) {
      // No row, no way to reach the object: take it back (logged if that fails too).
      await this.storage.remove(key);
      throw err;
    }
    this.emitter.emit(TASK_EVENTS.COMMENTED, {
      task: this.tasks.eventTask(row),
      actorId: actor.userId,
      text: kind === 'VOICE' ? 'Ovozli xabar' : name,
      attachment: kind === 'VOICE' ? 'VOICE' : 'FILE',
    });
    return {
      file: await this.view(saved.file, actor.userId, access.canManage),
      event: saved.event,
    };
  }

  async remove(
    taskId: string,
    fileId: string,
    actor: TaskActor,
  ): Promise<{ event: TaskEventRow }> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(FILES_OFF_MESSAGE);
    }
    const { access } = await this.tasks.loadForAccess(
      this.prisma,
      taskId,
      actor,
    );
    const file = await this.prisma.taskFile.findFirst({
      where: { id: fileId, taskId, deletedAt: null },
      select: { id: true, name: true, uploadedById: true },
    });
    if (!file) throw new NotFoundException(FILE_NOT_FOUND_MESSAGE);
    if (file.uploadedById !== actor.userId && !access.canManage) {
      throw new ForbiddenException(DELETE_REFUSED_MESSAGE);
    }
    const event = await this.prisma.$transaction(async (tx) => {
      // Conditional: two deletes at once write one history line.
      const { count } = await tx.taskFile.updateMany({
        where: { id: file.id, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: actor.userId },
      });
      if (count === 0) throw new NotFoundException(FILE_NOT_FOUND_MESSAGE);
      return tx.taskEvent.create({
        data: {
          taskId,
          type: 'FILE_DELETED',
          actorId: actor.userId,
          text: file.name,
          fileId: file.id,
          via: actor.via ?? 'WEB',
        },
        select: TASK_EVENT_SELECT,
      });
    });
    return { event };
  }

  /**
   * Spec §9.6: the objects of files deleted 30+ days ago. The rows stay
   * (history). The object goes first, then the row is stamped: a crash between
   * the two leaves the row unstamped and the next run deletes the (already
   * missing) object again, which R2 counts as success. `CRONS_ENABLED=false`
   * leaves `ScheduleModule` unloaded, so this never fires there.
   */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async purge(now = new Date()): Promise<number> {
    if (!this.storage.enabled) return 0;
    const before = new Date(now.getTime() - PURGE_AFTER_DAYS * 864e5);
    const rows = await this.prisma.taskFile.findMany({
      where: { deletedAt: { lt: before }, purgedAt: null },
      select: { id: true, key: true },
      orderBy: { deletedAt: 'asc' },
      take: PURGE_BATCH,
    });
    const gone: string[] = [];
    for (const r of rows) {
      if (await this.storage.remove(r.key)) gone.push(r.id);
    }
    if (gone.length) {
      await this.prisma.taskFile.updateMany({
        where: { id: { in: gone } },
        data: { purgedAt: now },
      });
    }
    return gone.length;
  }

  private async view(
    f: FileRow,
    userId: number,
    canManage: boolean,
  ): Promise<TaskFileView> {
    const [url, downloadUrl] = await Promise.all([
      this.storage.signedGet(f.key, f.mime, f.name, false),
      this.storage.signedGet(f.key, f.mime, f.name, true),
    ]);
    return {
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime,
      kind: f.kind,
      durationSec: f.durationSec,
      via: f.via,
      createdAt: f.createdAt,
      uploadedBy: f.uploadedBy,
      canDelete: f.uploadedById === userId || canManage,
      url,
      downloadUrl,
    };
  }
}
