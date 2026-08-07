import { Injectable } from '@nestjs/common';
import { EntityAction, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { computeChangedFields, stripSensitiveFields } from './diff.util';
import { assertCallerMayReadEntityHistory } from '../auth/entity-history-scope';

interface BaseHistoryParams {
  entityType: string;
  entityId: string | number;
  changedById?: number;
  companyId?: number;
  // Optional existing transaction client — when a finance flow wraps state
  // writes in a $transaction, passing tx here keeps the audit row atomic
  // with the change it describes. No tx → uses the default Prisma client.
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class EntityHistoryService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  async recordCreate(
    params: BaseHistoryParams & { newValues: Record<string, any> },
  ) {
    await this.client(params.tx).entityHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        action: EntityAction.CREATE,
        oldValues: undefined,
        newValues: stripSensitiveFields(params.newValues),
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });
  }

  async recordUpdate(
    params: BaseHistoryParams & {
      oldValues: Record<string, any>;
      newValues: Record<string, any>;
    },
  ) {
    const diff = computeChangedFields(params.oldValues, params.newValues);
    if (!diff) return;

    await this.client(params.tx).entityHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        action: EntityAction.UPDATE,
        oldValues: diff.oldValues,
        newValues: diff.newValues,
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });
  }

  async recordDelete(
    params: BaseHistoryParams & { oldValues: Record<string, any> },
  ) {
    await this.client(params.tx).entityHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        action: EntityAction.DELETE,
        oldValues: stripSensitiveFields(params.oldValues),
        newValues: undefined,
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });
  }

  async recordStatusChange(
    params: BaseHistoryParams & {
      oldValues: Record<string, any>;
      newValues: Record<string, any>;
    },
  ) {
    await this.client(params.tx).entityHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        action: EntityAction.STATUS_CHANGE,
        oldValues: params.oldValues,
        newValues: params.newValues,
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });

    // Emit outside the tx — listeners should not assume the write is committed
    // yet. Notifications/side-effects must tolerate the rare rollback case.
    this.eventEmitter.emit('entity.status.changed', {
      entityType: params.entityType,
      entityId: String(params.entityId),
      oldStatus: params.oldValues?.status,
      newStatus: params.newValues?.status,
      reason: params.newValues?.reason,
      changedById: params.changedById,
      companyId: params.companyId,
    });
  }

  async recordRestore(
    params: BaseHistoryParams & { newValues: Record<string, any> },
  ) {
    await this.client(params.tx).entityHistory.create({
      data: {
        entityType: params.entityType,
        entityId: String(params.entityId),
        action: EntityAction.RESTORE,
        oldValues: undefined,
        newValues: stripSensitiveFields(params.newValues),
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });
  }

  /**
   * @param caller present on the HTTP path, absent for internal readers.
   *
   * The endpoint took `entityType` and `entityId` straight off the URL and
   * checked only `companyId`, so any staff member could read the full edit
   * trail of any record in the company — 17 727 rows across 23 types in
   * production, each carrying the before-and-after of every changed field.
   * `assertCallerMayReadEntityHistory` gates it as the underlying record is
   * gated. The parameter is optional so an internal caller reading history
   * for its own purposes is not forced to invent a user id; every HTTP route
   * passes one.
   */
  async getHistory(
    entityType: string,
    entityId: string,
    companyId: number,
    options?: { page?: number; pageSize?: number },
    caller?: { userId: number; roles: string[] },
  ) {
    if (caller) {
      await assertCallerMayReadEntityHistory(
        this.prisma,
        caller.userId,
        caller.roles ?? [],
        entityType,
        String(entityId),
        companyId,
      );
    }
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const where = {
      entityType,
      entityId: String(entityId),
      companyId,
    };

    const [data, total] = await Promise.all([
      this.prisma.entityHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          changedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              roles: { select: { role: { select: { id: true } } } },
            },
          },
        },
      }),
      this.prisma.entityHistory.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
