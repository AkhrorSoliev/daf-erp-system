import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateAbsencePauseSettingsDto } from './dto/update-absence-pause-settings.dto';

@Controller('absence-pause')
@UseGuards(RolesGuard)
export class AbsencePauseController {
  constructor(private settings: AbsencePauseSettingService) {}

  @Get('settings')
  @Roles('CEO', 'Branch Director')
  get(@CurrentUser('companyId') companyId: number) {
    return this.settings.get(companyId);
  }

  /**
   * Yozish FAQAT CEO.
   *
   * Sozlama butun kompaniyaga taalluqli — filial direktori o'zgartirsa
   * ikkinchi filialdagi o'quvchilarga ham ta'sir qilardi, va u buni
   * ko'rmasdi ham. O'qish unga ochiq: o'z filialida nega kimdir pauzaga
   * tushganini tushuntira olishi kerak.
   */
  @Patch('settings')
  @Roles('CEO')
  update(
    @Body() dto: UpdateAbsencePauseSettingsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.settings.update(companyId, dto, userId);
  }
}
