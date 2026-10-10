import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnyUser, Can } from '../common/permissions/access.decorators';

@Controller('company')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Get()
  @AnyUser()
  findAll(
    @Query() paginationDto: PaginationDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    // Multi-tenant: a caller may only ever see their own company.
    return this.companyService.findAll(paginationDto, companyId);
  }

  @Get(':id')
  @AnyUser()
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
  @Can('settings.company')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    // Multi-tenant: a caller may only edit their OWN company — mirror the read
    // guard on findOne. Without this a holder of `settings.company` could PATCH
    // another tenant's company row (the capability alone doesn't bind the id to
    // the caller).
    if (id !== companyId) {
      throw new ForbiddenException(
        "Boshqa kompaniya ma'lumotini o'zgartirish mumkin emas",
      );
    }
    return this.companyService.update(id, dto);
  }
}
