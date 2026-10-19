import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { AbsenceStreakService } from '../outreach/absence-streak.service';
import { EntityHistoryService } from '../common/entity-history';
import { HistoryQueryDto } from '../common/entity-history/dto/history-query.dto';
import { Can } from '../common/permissions/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateAbsencePauseSettingsDto } from './dto/update-absence-pause-settings.dto';
import { PreviewAbsencePauseDto } from './dto/preview-absence-pause.dto';

@Controller('absence-pause')
export class AbsencePauseController {
  constructor(
    private settings: AbsencePauseSettingService,
    private streaks: AbsenceStreakService,
    private entityHistory: EntityHistoryService,
  ) {}

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

  /**
   * Sozlamaning o'zgarish tarixi (kim, qachon, nimani). Umumiy
   * `GET /entity-history/...` yo'li bu turni rad etadi (u faqat o'z
   * yozuvlariga ega turlarni biladi), shuning uchun alohida yo'l — xuddi
   * `GET /permissions/history` kabi. Sozlama kompaniyaga bitta, shuning
   * uchun `entityId` — kompaniya raqami.
   */
  @Get('history')
  @Can('settings.absence-pause')
  async history(
    @Query() query: HistoryQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    const res = await this.entityHistory.getHistory(
      'AbsencePauseSetting',
      String(companyId),
      companyId,
      { page: query.page, pageSize: query.pageSize },
    );
    return {
      data: res.data.map((r) => ({
        id: r.id,
        action: r.action,
        createdAt: r.createdAt,
        oldValues: r.oldValues,
        newValues: r.newValues,
        changedBy: r.changedBy
          ? {
              id: r.changedBy.id,
              firstName: r.changedBy.firstName,
              lastName: r.changedBy.lastName,
            }
          : null,
      })),
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
    };
  }

  /**
   * «Yoqsam hozir nechta o'quvchi pauzaga tushadi?» — hech narsa yozmaydi.
   * Cron bilan BIR xil hisob (`computeStreaks`) va BIR xil qamrov (butun
   * kompaniya), shuning uchun ko'rsatilgan son ertangi 07:30 yurishdagi
   * nomzodlar sonidan farq qilmaydi (o'rtada yangi davomat kiritilmasa).
   */
  @Get('preview')
  @Can('settings.absence-pause')
  async preview(
    @Query() query: PreviewAbsencePauseDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    const rows = await this.streaks.computeStreaks({
      companyId,
      threshold: query.pauseThreshold,
    });
    return { candidates: rows.length };
  }
}
