import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { Can } from '../common/permissions/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateAbsencePauseSettingsDto } from './dto/update-absence-pause-settings.dto';

@Controller('absence-pause')
export class AbsencePauseController {
  constructor(private settings: AbsencePauseSettingService) {}

  @Get('settings')
  @Can('settings.absence-pause')
  get(@CurrentUser('companyId') companyId: number) {
    return this.settings.get(companyId);
  }

  /**
   * Yozish `settings.company` imkoniyatini talab qiladi (kompaniya darajasi).
   *
   * Sozlama butun kompaniyaga taalluqli — filial direktori o'zgartirsa
   * ikkinchi filialdagi o'quvchilarga ham ta'sir qilardi, va u buni
   * ko'rmasdi ham. O'qish (`settings.absence-pause`) unga ochiq: o'z
   * filialida nega kimdir pauzaga tushganini tushuntira olishi kerak.
   */
  @Patch('settings')
  @Can('settings.company')
  update(
    @Body() dto: UpdateAbsencePauseSettingsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.settings.update(companyId, dto, userId);
  }
}
