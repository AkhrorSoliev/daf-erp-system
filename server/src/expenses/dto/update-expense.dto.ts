import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional } from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';

/**
 * Every field of `CreateExpenseDto`, each optional, each still validated.
 *
 * The handler used to take `Partial<CreateExpenseDto>`: TypeScript emits that
 * as `Object`, the global ValidationPipe skips `Object`, and any amount,
 * category, date or unknown field reached the service unchecked.
 *
 * `skipNullProperties: false` validates a `null` instead of skipping it: a
 * `null` amount or branch would fail in Prisma as a 500, and a `null` category
 * would pass `categoryChanged` and re-post the ledger entry for nothing.
 */
export class UpdateExpenseDto extends PartialType(
  OmitType(CreateExpenseDto, ['relatedUserId'] as const),
  { skipNullProperties: false },
) {
  // The one field that may be cleared: the expense form sends `null` on every
  // save, and the service refuses it on an advance.
  @IsOptional()
  @IsInt()
  relatedUserId?: number | null;
}
