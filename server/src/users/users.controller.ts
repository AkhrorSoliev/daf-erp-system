import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.usersService.findAll(query.page, query.pageSize);
  }
}
