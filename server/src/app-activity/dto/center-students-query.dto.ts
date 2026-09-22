import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toStringArray } from '../../common/dto/to-array';
import {
  OquvchilarSorovi,
  SAHIFA_HAJMI,
  SARALASHLAR,
} from '../center/markaz-royxat';
import type { Saralash, Yonalish } from '../center/markaz-royxat';
import { Holat, HOLATLAR } from '../norma/norma';
import { DARAJALAR } from '../stats/daraja';
import type { Daraja } from '../stats/daraja';
import { davrniOqi } from '../stats/davr';

/** `GET /app-activity/center/students` va `/students/phones` (dizayn 6.1). */
export class CenterStudentsQueryDto {
  @IsOptional()
  @IsIn(['7', '30'])
  period?: string;

  /** `?status=QIZIL,SARIQ` — bir nechtasi birga (server/CLAUDE.md ko'p qiymatli filtr). */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(HOLATLAR, { each: true })
  status?: Holat[];

  @IsOptional()
  @IsIn(['ha', 'yoq'])
  kirgan?: 'ha' | 'yoq';

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsIn(DARAJALAR)
  level?: Daraja;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(SARALASHLAR)
  sort?: Saralash;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: Yonalish;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export function sorovniOqi(q: CenterStudentsQueryDto): OquvchilarSorovi {
  return {
    davr: davrniOqi(q.period),
    status: q.status,
    kirgan: q.kirgan === undefined ? undefined : q.kirgan === 'ha',
    groupId: q.groupId,
    teacherId: q.teacherId,
    level: q.level,
    q: q.q,
    sort: q.sort ?? 'holat',
    dir: q.dir ?? 'asc',
    page: q.page ?? 1,
    pageSize: q.pageSize ?? SAHIFA_HAJMI,
  };
}
