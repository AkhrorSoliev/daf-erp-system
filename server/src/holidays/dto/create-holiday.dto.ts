import {
  IsDateString,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateHolidayDto {
  @IsNotEmpty({ message: "Bayram nomi bo'sh bo'lmasligi kerak" })
  @IsString()
  @MaxLength(200)
  name: string;

  @IsNotEmpty({ message: "Sana ko'rsatilishi shart" })
  @IsDateString(
    {},
    { message: "Sana to'g'ri formatda bo'lishi kerak (YYYY-MM-DD)" },
  )
  date: string;
}
