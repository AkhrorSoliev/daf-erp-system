import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('company')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.companyService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.companyService.findOne(id);
  }

  @Patch(':id')
  @Roles('CEO', 'Administrator')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companyService.update(id, dto);
  }
}
