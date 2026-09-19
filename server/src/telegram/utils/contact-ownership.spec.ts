import { contactBelongsToSender, CONTACT_NOT_OWN } from './contact-ownership';

describe('contactBelongsToSender', () => {
  const me = { id: 4242 };

  it("«Telefon raqamni yuborish» tugmasidan kelgan o'z kontaktini qabul qiladi", () => {
    expect(contactBelongsToSender({ user_id: 4242 }, me)).toBe(true);
  });

  it('boshqa odamning kontakt kartasini rad etadi', () => {
    expect(contactBelongsToSender({ user_id: 1 }, me)).toBe(false);
  });

  it("user_id'siz kartani rad etadi — raqam isbotlanmagan", () => {
    expect(contactBelongsToSender({}, me)).toBe(false);
  });

  it("yuboruvchi noma'lum bo'lsa rad etadi", () => {
    expect(contactBelongsToSender({ user_id: 4242 }, undefined)).toBe(false);
  });

  it('xabar tugmani nomi bilan aytadi', () => {
    expect(CONTACT_NOT_OWN).toContain('Telefon raqamni yuborish');
  });
});
