import { IsIn } from 'class-validator';

/**
 * `GET .../reyting` so'rov parametri.
 *
 * Ilgari `scope` qo'lda tekshirilardi (`@Query('scope') scope: string` +
 * kontrollerdagi inline `if`) — repodagi boshqa har bir so'rov parametri
 * DTO orqali class-validator bilan tekshiriladi, va bu yerni undan
 * mustasno qilishga asos yo'q edi.
 */
export class ReytingQueryDto {
  @IsIn(['gruppe', 'zentrum'])
  scope!: 'gruppe' | 'zentrum';
}
