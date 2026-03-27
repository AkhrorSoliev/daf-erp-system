import { Controller, Get, Post, Delete, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { ArchiveEntityType, ArchiveQueryDto } from './dto/archive-query.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('archive')
@UseGuards(RolesGuard)
@Roles('CEO')
export class ArchiveController {
  constructor(private archiveService: ArchiveService) {}

  @Get('counts')
  getCounts() {
    return this.archiveService.getCounts();
  }

  @Get(':entityType')
  findAll(
    @Param('entityType') entityType: ArchiveEntityType,
    @Query() query: ArchiveQueryDto,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.findAll(entityType, query);
  }

  @Get(':entityType/:id')
  findOne(
    @Param('entityType') entityType: ArchiveEntityType,
    @Param('id') id: string,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.findOne(entityType, id);
  }

  @Post(':entityType/:id/restore')
  restore(
    @Param('entityType') entityType: ArchiveEntityType,
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.restore(entityType, id, userId);
  }

  @Delete(':entityType/:id')
  permanentDelete(
    @Param('entityType') entityType: ArchiveEntityType,
    @Param('id') id: string,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.permanentDelete(entityType, id);
  }

  private validateEntityType(entityType: string) {
    const validTypes = Object.values(ArchiveEntityType);
    if (!validTypes.includes(entityType as ArchiveEntityType)) {
      throw new BadRequestException(
        `Noto'g'ri entity turi: ${entityType}. Ruxsat etilgan: ${validTypes.join(', ')}`,
      );
    }
  }
}
