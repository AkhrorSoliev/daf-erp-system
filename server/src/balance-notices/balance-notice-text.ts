import { formatUzPhone } from '../common/utils/phone.util';
import { greetingLine, untilDay } from '../refunds/refund-student-text';
import { formatSum } from '../telegram-groups/utils/format.util';

/**
 * The bot notice — second version, approved by the CEO on 10.10.2026 (spec
 * §5.3; the first, one-paragraph version was found dry the same day). Do not
 * reword: the spec test pins every line. `allowedFrom` is
 * `transferTerm(today).allowedFrom`; `phone` is the branch's, else the
 * company's. SmsService sends HTML, so the name is escaped.
 */
export function balanceNoticeText(p: {
  firstName: string;
  balance: number;
  allowedFrom: string;
  phone: string;
}): string {
  return [
    '<b>💰 Hisobingizda pul qolgan</b>',
    '',
    greetingLine(p.firstName),
    '',
    `DaF Sprachzentrum hisobingizda <b>${formatSum(p.balance)}</b> qolgan.`,
    `Uni qaytarib olish uchun <b>${untilDay(p.allowedFrom)}</b> filial raqamiga qo'ng'iroq qiling:`,
    `📞 ${formatUzPhone(p.phone)}`,
    '',
    "⚠️ Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul <b>markaz hisobiga o'tadi</b>.",
    '',
    'Rahmat!',
  ].join('\n');
}
