import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ChangeBranchStatusDto } from './dto/change-branch-status.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Get()
  findAll(@Query() query: BranchQueryDto) {
    return this.branchesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.branchesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBranchDto, @CurrentUser('id') userId: number) {
    return this.branchesService.create(dto, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.branchesService.update(id, dto, userId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeBranchStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.branchesService.changeStatus(id, dto, userId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  getStatusHistory(@Param('id', ParseIntPipe) id: number) {
    return this.branchesService.getStatusHistory(id);
  }
}
