import { IsIn } from 'class-validator';
import { UI_SKIN_IDS } from '../../common/ui-skins';

/** Your own design skin (ADR-0101): one of the five known ids, nothing else. */
export class UpdateUiSkinDto {
  @IsIn(UI_SKIN_IDS, { message: "Noma'lum dizayn uslubi" })
  skin!: string;
}
