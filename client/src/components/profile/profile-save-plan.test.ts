import { describe, expect, it } from "vitest";
import { describeSaveFailure, isPhoneChanged, planProfileSave } from "./profile-save-plan";

const user = {
  firstName: "Akmal",
  lastName: "Karimov",
  phone: "901112233",
  photo: "https://cdn.example/a.jpg",
};
const unchanged = {
  firstName: "Akmal",
  lastName: "Karimov",
  phone: "901112233",
  currentPassword: "",
};
const noPhoto = { previewPhoto: null, photoRemoved: false };

describe("isPhoneChanged", () => {
  it("compares with the stored phone, treating a missing one as empty", () => {
    expect(isPhoneChanged("901112233", "901112233")).toBe(false);
    expect(isPhoneChanged("901112233", "909998877")).toBe(true);
    expect(isPhoneChanged(null, "")).toBe(false);
    expect(isPhoneChanged(null, "909998877")).toBe(true);
  });
});

describe("planProfileSave", () => {
  it("sends nothing when nothing changed", () => {
    expect(planProfileSave({ user, values: unchanged, ...noPhoto })).toEqual({});
  });

  it("sends a name change to the profile door only", () => {
    expect(
      planProfileSave({ user, values: { ...unchanged, firstName: "Anvar" }, ...noPhoto }),
    ).toEqual({ profile: { firstName: "Anvar" } });
  });

  it("sends a phone change to the phone door with the current password, never to the profile door", () => {
    expect(
      planProfileSave({
        user,
        values: { ...unchanged, phone: "909998877", currentPassword: "secret1" },
        ...noPhoto,
      }),
    ).toEqual({ phone: { phone: "909998877", currentPassword: "secret1" } });
  });

  it("splits a phone change and a name change across the two doors", () => {
    expect(
      planProfileSave({
        user,
        values: {
          ...unchanged,
          lastName: "Aliyev",
          phone: "909998877",
          currentPassword: "secret1",
        },
        ...noPhoto,
      }),
    ).toEqual({
      phone: { phone: "909998877", currentPassword: "secret1" },
      profile: { lastName: "Aliyev" },
    });
  });

  it("sends a removed photo as an empty string and a new one as its URL", () => {
    expect(
      planProfileSave({ user, values: unchanged, previewPhoto: null, photoRemoved: true }),
    ).toEqual({ profile: { photo: "" } });
    expect(
      planProfileSave({
        user,
        values: unchanged,
        previewPhoto: "https://cdn.example/b.jpg",
        photoRemoved: false,
      }),
    ).toEqual({ profile: { photo: "https://cdn.example/b.jpg" } });
  });

  it("does not resend the photo that is already stored", () => {
    expect(
      planProfileSave({
        user,
        values: unchanged,
        previewPhoto: "https://cdn.example/a.jpg",
        photoRemoved: false,
      }),
    ).toEqual({});
  });
});

describe("describeSaveFailure", () => {
  it("passes the server's reason through when nothing was saved", () => {
    expect(describeSaveFailure({ phoneSaved: false, reason: "Joriy parol noto'g'ri" })).toBe(
      "Joriy parol noto'g'ri",
    );
  });

  it("says the phone was saved when only the later step failed", () => {
    expect(describeSaveFailure({ phoneSaved: true, reason: "Rasm yuklanmadi" })).toBe(
      "Telefon raqam saqlandi, lekin qolgan o'zgarishlar saqlanmadi: Rasm yuklanmadi",
    );
  });
});
