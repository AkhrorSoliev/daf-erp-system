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
import { CoursesService } from './courses.service';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ChangeCourseStatusDto } from './dto/change-course-status.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get()
  findAll(@Query() query: CourseQueryDto) {
    return this.coursesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCourseDto, @CurrentUser('id') userId: number) {
    return this.coursesService.create(dto, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.coursesService.update(id, dto, userId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeCourseStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.coursesService.changeStatus(id, dto, userId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(@Param('id') id: string) {
    return this.coursesService.getStatusHistory(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.coursesService.delete(id, userId);
  }
}
