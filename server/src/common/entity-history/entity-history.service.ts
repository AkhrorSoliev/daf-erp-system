import { Injectable } from '@nestjs/common';
import { EntityAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeChangedFields, stripSensitiveFields } from './diff.util';

interface BaseHistoryParams {
  entityType: string;
  entityId: string | number;
  changedById?: number;
  companyId?: number;
}

@Injectable()
export class EntityHistoryService {
  constructor(private prisma: PrismaService) {}

  async recordCreate(
    params: BaseHistoryParams & { newValues: Record<string, any> },
  ) {
    await this.prisma.entityHistory.create({
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

    await this.prisma.entityHistory.create({
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
    await this.prisma.entityHistory.create({
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
    await this.prisma.entityHistory.create({
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
  }

  async recordRestore(
    params: BaseHistoryParams & { newValues: Record<string, any> },
  ) {
    await this.prisma.entityHistory.create({
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

  async getHistory(
    entityType: string,
    entityId: string,
    options?: { page?: number; pageSize?: number },
  ) {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.entityHistory.findMany({
        where: { entityType, entityId: String(entityId) },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          changedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.entityHistory.count({
        where: { entityType, entityId: String(entityId) },
      }),
    ]);

    return { data, total, page, pageSize };
  }
}
