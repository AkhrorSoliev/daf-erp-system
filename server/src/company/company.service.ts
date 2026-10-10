import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async findAll(paginationDto: PaginationDto, companyId: number) {
    const { page = 1, pageSize = 10 } = paginationDto;
    const skip = (page - 1) * pageSize;

    // Multi-tenant: scope to the caller's own company only — never list every
    // tenant's company row.
    const where = { id: companyId };

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: number) {
    // The company row only. This used to include every branch (address, phone,
    // representative) and every course (price, payment model) — handed to any
    // signed-in account (`@AnyUser`, students included), past the ceiling on
    // `GET /branches` and the scope on `GET /courses`. Both settings pages that
    // read this route use company fields alone.
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException(`Company #${id} topilmadi`);
    }

    return company;
  }

  async update(id: number, dto: UpdateCompanyDto) {
    const mavjud = await this.findOne(id);

    // Sariq chegarasi yashil chegaradan kichik bo'lishi shart — teng bo'lsa
    // sariq oraliq yo'qoladi va «qisman» degan holat hech qachon chiqmaydi.
    // Ikki maydon alohida kelishi mumkin, shuning uchun mavjud qiymat bilan
    // birga tekshiriladi.
    const sariq = dto.dafSariqKun ?? mavjud.dafSariqKun;
    const haftalik = dto.dafHaftalikKun ?? mavjud.dafHaftalikKun;
    if (sariq >= haftalik) {
      throw new BadRequestException(
        `Sariq chegarasi haftalik normadan kichik bo'lishi kerak (sariq=${sariq}, haftalik=${haftalik})`,
      );
    }

    return this.prisma.company.update({
      where: { id },
      data: dto,
    });
  }
}
