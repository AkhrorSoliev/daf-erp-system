import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLeadColumnDto } from './dto/create-lead-column.dto';
import { UpdateLeadColumnDto } from './dto/update-lead-column.dto';
import { ReorderLeadColumnsDto } from './dto/reorder-lead-columns.dto';
import {
  ReportBranchIds,
  branchIdWhere,
  requireSingleBranchForWrite,
} from '../common/finance/report-branch-scope';

/**
 * Board columns. One row is seeded as a fixed/system column (systemKey NEW)
 * and cannot be renamed, reordered or deleted — it always stays at position 0.
 * Custom columns are fully manageable and live at positions 1 and beyond.
 */
@Injectable()
export class LeadColumnsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Every id-addressed column operation resolves through here.
   *
   * `update` and `remove` matched on `{ id, deletedAt: null }` alone — no
   * company, no branch — so a director could rename or delete the other
   * branch's board structure. Deleting is guarded by the empty-sections check,
   * but renaming was unguarded and silent.
   */
  private async ensureColumnInScope(
    id: string,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const column = await this.prisma.leadColumn.findFirst({
      where: { id, deletedAt: null, companyId, ...branchIdWhere(scope) },
    });
    if (!column) {
      throw new NotFoundException('Ustun topilmadi');
    }
    return column;
  }

  async create(
    dto: CreateLeadColumnDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Ustun nomi bo'sh bo'lishi mumkin emas");
    }

    // A column belongs to one branch, so a CEO on "Barcha filiallar" has not
    // said enough to create one. Refusing beats picking a branch for them.
    const branchId = requireSingleBranchForWrite(scope, 'Ustun yaratish');

    // Uniqueness is per branch. It used to be global — not even scoped to the
    // company — so once each branch keeps its own board, Namangan could not
    // create a "Kechki kurs" column because Fargona already had one.
    const existing = await this.prisma.leadColumn.findFirst({
      where: { name, deletedAt: null, companyId, branchId },
    });
    if (existing) {
      throw new ConflictException(
        'Bu filialda shu nomdagi ustun allaqachon mavjud',
      );
    }

    const maxOrder = await this.prisma.leadColumn.aggregate({
      where: { deletedAt: null, companyId, branchId },
      _max: { order: true },
    });

    const created = await this.prisma.leadColumn.create({
      data: {
        name,
        order: (maxOrder._max.order ?? -1) + 1,
        isSystem: false,
        companyId,
        branchId,
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'LeadColumn',
      entityId: created.id,
      newValues: { name: created.name, branchId: created.branchId },
      changedById: userId,
      companyId,
    });

    return {
      id: created.id,
      name: created.name,
      order: created.order,
      isSystem: created.isSystem,
      systemKey: created.systemKey,
      branchId: created.branchId,
      branch: created.branch,
      sections: [],
    };
  }

  async update(
    id: string,
    dto: UpdateLeadColumnDto,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const existing = await this.ensureColumnInScope(id, companyId, scope);
    if (existing.isSystem) {
      throw new BadRequestException(
        "Tizim ustuni nomini o'zgartirib bo'lmaydi",
      );
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Ustun nomi bo'sh bo'lishi mumkin emas");
    }
    if (name !== existing.name) {
      const clash = await this.prisma.leadColumn.findFirst({
        where: {
          name,
          deletedAt: null,
          id: { not: id },
          companyId,
          branchId: existing.branchId,
        },
      });
      if (clash) {
        throw new ConflictException(
          'Bu filialda shu nomdagi ustun allaqachon mavjud',
        );
      }
    }

    const updated = await this.prisma.leadColumn.update({
      where: { id },
      data: { name },
    });

    await this.entityHistoryService.recordUpdate({
      entityType: 'LeadColumn',
      entityId: id,
      oldValues: { name: existing.name },
      newValues: { name: updated.name },
      changedById: userId,
      companyId,
    });

    return { id: updated.id, name: updated.name };
  }

  async remove(
    id: string,
    companyId: number,
    userId: number,
    scope: ReportBranchIds,
  ) {
    const existing = await this.ensureColumnInScope(id, companyId, scope);
    if (existing.isSystem) {
      throw new BadRequestException("Tizim ustunini o'chirib bo'lmaydi");
    }

    const sectionCount = await this.prisma.leadSection.count({
      where: { columnId: id, deletedAt: null },
    });
    if (sectionCount > 0) {
      throw new BadRequestException(
        "Avval ustundagi bo'limlarni o'chiring",
      );
    }

    await this.entityHistoryService.recordDelete({
      entityType: 'LeadColumn',
      entityId: id,
      oldValues: { name: existing.name },
      changedById: userId,
      companyId,
    });

    await this.prisma.leadColumn.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    return { message: "Ustun o'chirildi" };
  }

  /**
   * Reorders custom columns. The single system column (NEW) is always pinned to
   * position 0; custom columns follow at 1, 2, 3, ...
   *
   * Reordering is a per-branch operation: `order` is only meaningful within one
   * board, and the request sends a complete list of ids. A caller spanning
   * every branch would be sending Fargona's and Namangan's columns interleaved,
   * so the scope must name exactly one branch.
   */
  async reorder(
    dto: ReorderLeadColumnsDto,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const branchId = requireSingleBranchForWrite(
      scope,
      "Ustunlar tartibini o'zgartirish",
    );
    const columns = await this.prisma.leadColumn.findMany({
      where: { deletedAt: null, companyId, branchId },
      select: { id: true, isSystem: true, systemKey: true },
    });
    const customIds = new Set(
      columns.filter((c) => !c.isSystem).map((c) => c.id),
    );

    for (const id of dto.columnIds) {
      if (!customIds.has(id)) {
        throw new BadRequestException(
          'Ustun topilmadi yoki tizim ustuni ko‘chirib bo‘lmaydi',
        );
      }
    }
    if (dto.columnIds.length !== customIds.size) {
      throw new BadRequestException(
        "Barcha maxsus ustunlar tartibda ko'rsatilishi kerak",
      );
    }

    await this.prisma.$transaction([
      ...columns
        .filter((c) => c.isSystem)
        .map((c) =>
          this.prisma.leadColumn.update({
            where: { id: c.id },
            data: { order: 0 },
          }),
        ),
      ...dto.columnIds.map((id, index) =>
        this.prisma.leadColumn.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    ]);

    return { message: 'Ustunlar tartibi yangilandi' };
  }
}
