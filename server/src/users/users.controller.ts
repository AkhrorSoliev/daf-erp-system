import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserQueryDto } from './dto/user-query.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }
}
