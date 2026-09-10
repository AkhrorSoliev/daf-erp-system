import { IsNotEmpty, IsString } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';

/**
 * /students eshigining HTTP shartnomasi. `sourceId` shu yerda majburiy, chunki
 * to'g'ridan qo'shilgan o'quvchining manbasi boshqa hech qayerdan bilinmaydi.
 * `LeadsService.convert` ichki chaqiruv bo'lgani uchun oddiy `CreateStudentDto`
 * dan foydalanadi — u yerda manba lidning o'zida saqlangan.
 */
export class CreateStudentDirectDto extends CreateStudentDto {
  @IsString()
  @IsNotEmpty({ message: '«Qayerdan bildi?» maydonini tanlang' })
  sourceId: string;
}
