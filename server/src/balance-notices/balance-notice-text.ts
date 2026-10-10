import { formatUzPhone } from '../common/utils/phone.util';
import { monthName, som } from '../statements/statement-text';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/**
 * The bot notice — variant 1, approved by the CEO on 10.10.2026. Do not
 * reword: the spec test pins it. `allowedFrom` is `transferTerm(today).allowedFrom`;
 * `phone` is the branch's, else the company's. SmsService sends HTML, so the
 * name is escaped.
 */
export function balanceNoticeText(p: {
  firstName: string;
  balance: number;
  allowedFrom: string;
  phone: string;
}): string {
  const until = `${Number(p.allowedFrom.slice(8, 10))}-${monthName(p.allowedFrom)}gacha`;
  return (
    `Assalomu alaykum, ${escapeHtml(p.firstName)}! ` +
    `DaF Sprachzentrum hisobingizda ${som(p.balance)} so'm qolgan. ` +
    `Uni qaytarib olish uchun ${until} filial raqamiga qo'ng'iroq qiling: ${formatUzPhone(p.phone)}. ` +
    `Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!`
  );
}
