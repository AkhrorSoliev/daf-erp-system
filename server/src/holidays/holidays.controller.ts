import { Controller } from '@nestjs/common';
import { HolidaysService } from './holidays.service';

@Controller('holidays')
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}
}
