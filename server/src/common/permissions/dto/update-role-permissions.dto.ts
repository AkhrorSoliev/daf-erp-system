import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { PERMISSION_KEYS, type PermissionKey } from '../permission-catalog';

export class RolePermissionChangeDto {
  @IsIn(PERMISSION_KEYS, { message: "Noma'lum imkoniyat" })
  key: PermissionKey;

  @IsBoolean({ message: "Imkoniyat holati noto'g'ri" })
  granted: boolean;
}

/** `PUT /permissions/roles/:roleId`: one toggle plus the dependencies it brought. */
export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Hech qanday o'zgarish yuborilmadi" })
  @ArrayMaxSize(200, { message: "O'zgarishlar juda ko'p" })
  @ValidateNested({ each: true })
  @Type(() => RolePermissionChangeDto)
  changes: RolePermissionChangeDto[];
}
