import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const INT4_MAX = 2_147_483_647;

/** `:id` of a person: whole digits, 1…int4. Beyond that Prisma throws on the Int column (a 500). */
@Injectable()
export class KpiUserIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = /^\d{1,10}$/.test(value) ? Number(value) : NaN;
    if (!(id >= 1 && id <= INT4_MAX)) {
      throw new BadRequestException("Xodim raqami noto'g'ri");
    }
    return id;
  }
}
