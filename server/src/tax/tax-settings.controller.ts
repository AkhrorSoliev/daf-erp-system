import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import { CurrentUser } from '../common/decorators';
import { TaxSettingsService } from './tax-settings.service';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';

@Controller('settings/tax')
@Can('settings.tax')
export class TaxSettingsController {
  constructor(private readonly tax: TaxSettingsService) {}

  @Get()
  get(@CurrentUser('companyId') companyId: number) {
    return this.tax.read(companyId);
  }

  @Patch()
  update(
    @Body() dto: UpdateTaxSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.tax.update(companyId, dto, userId);
  }
}
