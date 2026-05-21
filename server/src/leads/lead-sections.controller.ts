import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeadSectionsService } from './lead-sections.service';
import { CreateLeadSectionDto } from './dto/create-lead-section.dto';
import { UpdateLeadSectionDto } from './dto/update-lead-section.dto';
import { ReorderLeadSectionsDto } from './dto/reorder-lead-sections.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('lead-sections')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class LeadSectionsController {
  constructor(private readonly leadSectionsService: LeadSectionsService) {}

  @Post()
  create(
    @Body() dto: CreateLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSectionsService.create(dto, companyId, userId);
  }

  // Declared before ':id' so "/lead-sections/reorder" is not captured as an id.
  @Patch('reorder')
  reorder(@Body() dto: ReorderLeadSectionsDto) {
    return this.leadSectionsService.reorder(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSectionsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSectionsService.remove(id, companyId, userId);
  }
}
