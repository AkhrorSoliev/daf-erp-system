import { IsIn } from 'class-validator';
import { UI_LOCALES } from '../../common/ui-locales';

/** Your own interface language (ADR-0098): one of the five known ids, nothing else. */
export class UpdateUiLocaleDto {
  @IsIn(UI_LOCALES, { message: "Noma'lum til" })
  locale!: string;
}
