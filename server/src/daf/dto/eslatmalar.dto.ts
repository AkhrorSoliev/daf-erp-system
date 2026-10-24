import { IsBoolean } from 'class-validator';

/** `PATCH .../eslatmalar` tanasi (spec S4 §3) — faqat haqiqiy boolean. */
export class EslatmalarDto {
  @IsBoolean()
  yoqilgan!: boolean;
}
