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
import { CustomFormsService } from './custom-forms.service';
import { CreateCustomFormDto } from './dto/create-custom-form.dto';
import { UpdateCustomFormDto } from './dto/update-custom-form.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('custom-forms')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class CustomFormsController {
  constructor(private readonly service: CustomFormsService) {}

  @Get()
  list(@CurrentUser('companyId') companyId: number) {
    return this.service.list(companyId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  create(
    @Body() dto: CreateCustomFormDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFormDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.remove(id, companyId, userId);
  }
}
