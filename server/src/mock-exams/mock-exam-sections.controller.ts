import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MockExamSectionsService } from './mock-exam-sections.service';
import { CreateMockExamSectionDto } from './dto/create-mock-exam-section.dto';
import { UpdateMockExamSectionDto } from './dto/update-mock-exam-section.dto';
import { ReorderMockExamSectionsDto } from './dto/reorder-mock-exam-sections.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';

@Controller('mock-exam-sections')
export class MockExamSectionsController {
  constructor(
    private readonly mockExamSectionsService: MockExamSectionsService,
  ) {}

  @Get()
  @Can('mock.view')
  list(@CurrentUser('companyId') companyId: number) {
    return this.mockExamSectionsService.list(companyId);
  }

  @Post()
  @Can('mock.manage')
  create(
    @Body() dto: CreateMockExamSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.mockExamSectionsService.create(dto, companyId, userId);
  }

  // Declared before ':id' so "/mock-exam-sections/reorder" is not captured as an id.
  @Patch('reorder')
  @Can('mock.manage')
  reorder(
    @Body() dto: ReorderMockExamSectionsDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.mockExamSectionsService.reorder(dto, companyId);
  }

  @Patch(':id')
  @Can('mock.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMockExamSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.mockExamSectionsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  @Can('mock.manage')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.mockExamSectionsService.remove(id, companyId, userId);
  }
}
