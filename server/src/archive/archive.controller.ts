import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
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
  getCounts(@CurrentUser('companyId') companyId: number) {
    return this.archiveService.getCounts(companyId);
  }

  @Get(':entityType')
  findAll(
    @Param('entityType') entityType: ArchiveEntityType,
    @Query() query: ArchiveQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.findAll(entityType, query, companyId);
  }

  @Get(':entityType/:id')
  findOne(
    @Param('entityType') entityType: ArchiveEntityType,
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.findOne(entityType, id, companyId);
  }

  @Post(':entityType/:id/restore')
  restore(
    @Param('entityType') entityType: ArchiveEntityType,
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.restore(entityType, id, userId, companyId);
  }

  @Delete(':entityType/:id')
  permanentDelete(
    @Param('entityType') entityType: ArchiveEntityType,
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    this.validateEntityType(entityType);
    return this.archiveService.permanentDelete(entityType, id, companyId);
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
