import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards';

@Controller('company')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Get()
  findAll(
    @Query() paginationDto: PaginationDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    // Multi-tenant: a caller may only ever see their own company.
    return this.companyService.findAll(paginationDto, companyId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    if (id !== companyId) {
      throw new ForbiddenException(
        "Boshqa kompaniya ma'lumotini ko'rish mumkin emas",
      );
    }
    return this.companyService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyDto) {
    return this.companyService.update(id, dto);
  }
}
