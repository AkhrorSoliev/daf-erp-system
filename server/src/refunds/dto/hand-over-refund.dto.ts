import { IsUUID } from 'class-validator';

/** «Berildi»: the drawer the money left (an account of the student's branch). */
export class HandOverRefundDto {
  @IsUUID('all', { message: 'Kassani tanlang' })
  cashAccountId: string;
}
