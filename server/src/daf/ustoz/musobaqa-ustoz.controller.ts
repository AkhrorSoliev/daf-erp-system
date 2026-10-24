import { Controller, Get, Param, Query } from '@nestjs/common';
import { assertCallerMayTouchGroup } from '../../common/auth/group-branch-scope';
import { CurrentUser } from '../../common/decorators';
import { Can } from '../../common/permissions/access.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { MusobaqaQueryDto } from '../dto/musobaqa-query.dto';
import { MusobaqaUstozService } from './musobaqa-ustoz.service';

const RAD_XABARI =
  "Bu guruh boshqa filialga tegishli — musobaqa natijalarini ko'rish huquqingiz yo'q";

/**
 * Guruh sahifasi → «Musobaqa» tabi (spec S5). Sof ustoz faqat o'z guruhini,
 * qolganlar o'z filialini ko'radi (`assertCallerMayTouchGroup`). Hech narsa
 * yozmaydi.
 */
@Controller('groups')
export class MusobaqaUstozController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servis: MusobaqaUstozService,
  ) {}

  @Get(':id/musobaqa')
  @Can('groups.view')
  async guruh(
    @Param('id') id: string,
    @Query() query: MusobaqaQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchGroup(this.prisma, userId, roles, id, RAD_XABARI);
    return this.servis.guruhKorinishi(id, companyId, query.hafta, new Date());
  }
}
