import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MockExamSectionsService } from './mock-exam-sections.service';
import { CreateMockExamSectionDto } from './dto/create-mock-exam-section.dto';
import { UpdateMockExamSectionDto } from './dto/update-mock-exam-section.dto';
import { ReorderMockExamSectionsDto } from './dto/reorder-mock-exam-sections.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('mock-exam-sections')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class MockExamSectionsController {
  constructor(
    private readonly mockExamSectionsService: MockExamSectionsService,
  ) {}

  @Get()
  list() {
    return this.mockExamSectionsService.list();
  }

  @Post()
  create(
    @Body() dto: CreateMockExamSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.mockExamSectionsService.create(dto, companyId, userId);
  }

  // Declared before ':id' so "/mock-exam-sections/reorder" is not captured as an id.
  @Patch('reorder')
  reorder(@Body() dto: ReorderMockExamSectionsDto) {
    return this.mockExamSectionsService.reorder(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMockExamSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.mockExamSectionsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.mockExamSectionsService.remove(id, companyId, userId);
  }
}
