import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomQueryDto } from './dto/room-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CountByBranchQueryDto } from './dto/count-by-branch-query.dto';
import { ChangeRoomStatusDto } from './dto/change-room-status.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('rooms')
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Get('count-by-branch')
  countByBranch(@Query() query: CountByBranchQueryDto) {
    return this.roomsService.countByBranch(query);
  }

  @Get()
  findAll(@Query() query: RoomQueryDto) {
    return this.roomsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeRoomStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.roomsService.changeStatus(id, dto, userId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(@Param('id') id: string) {
    return this.roomsService.getStatusHistory(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.roomsService.delete(id, userId);
  }
}
