import { Injectable } from '@nestjs/common';
import { ArchiveEntityType, ArchiveQueryDto } from './dto/archive-query.dto';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveDeleteService } from './archive-delete.service';

@Injectable()
export class ArchiveService {
  constructor(
    private read: ArchiveReadService,
    private restoreService: ArchiveRestoreService,
    private deleteService: ArchiveDeleteService,
  ) {}

  // Reads
  getCounts(companyId: number) {
    return this.read.getCounts(companyId);
  }
  findAll(
    entityType: ArchiveEntityType,
    query: ArchiveQueryDto,
    companyId: number,
  ) {
    return this.read.findAll(entityType, query, companyId);
  }
  findOne(
    entityType: ArchiveEntityType,
    id: string | number,
    companyId: number,
  ) {
    return this.read.findOne(entityType, id, companyId);
  }

  // Restore
  restore(
    entityType: ArchiveEntityType,
    id: string | number,
    userId: number,
    companyId: number,
  ) {
    return this.restoreService.restore(entityType, id, userId, companyId);
  }

  // Permanent delete
  permanentDelete(
    entityType: ArchiveEntityType,
    id: string | number,
    companyId: number,
  ) {
    return this.deleteService.permanentDelete(entityType, id, companyId);
  }
}
