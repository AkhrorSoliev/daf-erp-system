import { Global, Module } from '@nestjs/common';
import { StudentLeadOriginService } from './student-lead-origin.service';

/**
 * Global, chunki o'quvchi UCH xil joyda tug'iladi: `/students` eshigi,
 * Telegram boti va mock imtihon ishtirokchisini aylantirish. Ular uchta
 * boshqa-boshqa modulda va bir-birini import qiladi — xizmat `StudentsModule`
 * ichida qolsa, qolgan ikkovi uni olish uchun modul halqasi yasashi kerak
 * bo'lardi. `EntityHistoryModule` ham aynan shu sababdan global.
 */
@Global()
@Module({
  providers: [StudentLeadOriginService],
  exports: [StudentLeadOriginService],
})
export class StudentOriginModule {}
