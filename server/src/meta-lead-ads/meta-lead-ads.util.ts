import { createHmac, timingSafeEqual } from 'crypto';
import { normalizeSharedPhone } from '../common/utils/phone.util';

/** `X-Hub-Signature-256: sha256=<hex>` over the raw body, keyed with the app secret. */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface MetaFieldData {
  name: string;
  values?: string[];
}

export interface ParsedMetaLead {
  firstName: string;
  lastName: string;
  phone: string;
}

/** A lead needs a last name; a one-word `full_name` gets this placeholder. */
const NO_LAST_NAME = '-';

/**
 * Reads Meta's instant-form answers (`full_name`, `first_name`, `last_name`,
 * `phone_number`). `null` when there is no usable phone — a lead nobody can
 * call is not worth a card.
 */
export function parseMetaLead(fields: MetaFieldData[]): ParsedMetaLead | null {
  const get = (name: string) =>
    fields.find((f) => f.name === name)?.values?.[0]?.trim() ?? '';

  const phone = normalizeSharedPhone(get('phone_number'));
  if (!phone) return null;

  let firstName = get('first_name');
  let lastName = get('last_name');
  if (!firstName && !lastName) {
    const [first = '', ...rest] = get('full_name').split(/\s+/).filter(Boolean);
    firstName = first;
    lastName = rest.join(' ');
  }
  if (!firstName) return null;

  return {
    firstName: firstName.slice(0, 100),
    lastName: (lastName || NO_LAST_NAME).slice(0, 100),
    phone,
  };
}

/** Meta lead `platform`: `ig` = Instagram, anything else Facebook. */
export function metaSourceName(platform: string | undefined): string {
  return platform === 'ig' ? 'Instagram' : 'Facebook';
}
