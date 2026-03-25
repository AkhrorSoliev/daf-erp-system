import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchQueryDto } from './dto/branch-query.dto';

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
}
