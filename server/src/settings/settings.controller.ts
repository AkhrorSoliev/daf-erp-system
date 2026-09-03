import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';
import { GetPaymentSettingsDto } from './dto/get-payment-settings.dto';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { resolveCallerBranchScope } from '../common/auth/branch-scope';
import { SettingKey } from './settings.types';

/**
 * `/settings` panelining "To'lov" bo'limi — CEO/direktor uchun.
 *
 * Filial qamrovi qoidasi (`server/CLAUDE.md` "Object-level branch
 * confinement"ga mos): CEO kompaniya darajasida VA istalgan filialda
 * yoza oladi; Branch Director FAQAT o'z filialining override'ini yoza
 * oladi — kompaniya darajasidagi qiymatga hech qachon tegmaydi.
 */
@Controller('settings')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private prisma: PrismaService,
  ) {}

  @Get('payment')
  async getPayment(
    @Query() query: GetPaymentSettingsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    const branchId = await this.resolveReadBranchId(userId, query.branchId);
    const settings = await this.settingsService.getMany(companyId, branchId);
    // Faqat kompaniya darajasidagi ko'rinishda (CEO, `branchId` so'ralmagan)
    // ma'noli — shu yerda qaysi filiallar o'z override'iga ega ekanini ham
    // qaytaramiz, aks holda BDning saqlagan filial qiymati CEO ekranida
    // ko'rinmas edi (bitta "umumiy" qiymat ko'rsatib, aslida bir filialda
    // boshqacha ishlayotganini yashirardi).
    const branchOverrides =
      branchId == null
        ? await this.settingsService.getBranchOverrides(companyId)
        : undefined;
    return { branchId: branchId ?? null, settings, branchOverrides };
  }

  @Patch('payment')
  async updatePayment(
    @Body() dto: UpdatePaymentSettingsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    const branchId = await this.resolveWriteBranchId(
      userId,
      companyId,
      dto.branchId,
    );

    const edits: Array<[SettingKey, unknown]> = [];
    if (dto.defaultModel !== undefined) {
      edits.push(['payment.defaultModel', dto.defaultModel]);
    }
    if (dto.excusedCreditEnabled !== undefined) {
      edits.push(['payment.excusedCreditEnabled', dto.excusedCreditEnabled]);
    }
    if (dto.excusedCreditMonthlyCap !== undefined) {
      edits.push([
        'payment.excusedCreditMonthlyCap',
        dto.excusedCreditMonthlyCap,
      ]);
    }
    if (dto.chargeDayOfMonth !== undefined) {
      edits.push(['payment.chargeDayOfMonth', dto.chargeDayOfMonth]);
    }

    if (edits.length === 0) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }

    for (const [key, value] of edits) {
      await this.settingsService.set(companyId, key, value, userId, branchId);
    }

    const settings = await this.settingsService.getMany(companyId, branchId);
    return { branchId: branchId ?? null, settings };
  }

  /**
   * O'qish uchun nishonlangan filial: CEO so'ragan `branchId`ni oladi (yoki
   * berilmasa kompaniya darajasi), Branch Director esa har doim o'z
   * qamrovidagi filialga qulflanadi — so'ralgan `branchId` faqat o'z
   * qamrovida bo'lsagina qabul qilinadi.
   */
  private async resolveReadBranchId(
    userId: number,
    requestedBranchId: number | undefined,
  ): Promise<number | undefined> {
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    if (scope.kind === 'all') return requestedBranchId;

    if (scope.branchIds.length === 0) {
      throw new ForbiddenException('Sizga hech qanday filial biriktirilmagan');
    }
    if (
      requestedBranchId != null &&
      !scope.branchIds.includes(requestedBranchId)
    ) {
      throw new ForbiddenException(
        "Bu boshqa filialga tegishli — sizda ruxsat yo'q",
      );
    }
    return requestedBranchId ?? scope.branchIds[0];
  }

  /**
   * Yozish uchun nishonlangan filial — CEO kompaniya darajasida (`branchId`
   * berilmasa) yoki istalgan filialda yoza oladi. Branch Director HECH
   * QACHON kompaniya darajasidagi qiymatga tega olmaydi — natija har doim
   * ularning o'z filiali bo'ladi, `dto.branchId`dan qat'i nazar (agar
   * ular boshqa filial yozishga urinsa — rad etiladi).
   */
  private async resolveWriteBranchId(
    userId: number,
    companyId: number,
    requestedBranchId: number | undefined,
  ): Promise<number | undefined> {
    const scope = await resolveCallerBranchScope(this.prisma, userId);

    if (scope.kind === 'all') {
      if (requestedBranchId != null) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: requestedBranchId, deletedAt: null, companyId },
          select: { id: true },
        });
        if (!branch) {
          throw new BadRequestException(
            `Filial #${requestedBranchId} topilmadi`,
          );
        }
      }
      return requestedBranchId;
    }

    if (scope.branchIds.length === 0) {
      throw new ForbiddenException('Sizga hech qanday filial biriktirilmagan');
    }
    if (
      requestedBranchId != null &&
      !scope.branchIds.includes(requestedBranchId)
    ) {
      throw new ForbiddenException(
        "Bu boshqa filialga tegishli — sizda ruxsat yo'q",
      );
    }
    // BD kompaniya darajasiga (branchId=null) hech qachon yozolmaydi — hatto
    // `dto.branchId` berilmagan bo'lsa ham o'z filialiga tushadi.
    return requestedBranchId ?? scope.branchIds[0];
  }
}
