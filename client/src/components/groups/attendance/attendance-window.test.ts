import { describe, expect, it } from "vitest";
import { windowBanner } from "./attendance-window";

const base = {
  startTime: "15:00",
  endTime: "16:30",
  isToday: true,
  hasAttendance: false,
  alreadyTakenForTeacher: false,
};

describe("windowBanner", () => {
  it("tells the teacher the attendance is taken once and closes at the end", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: false })).toEqual({
      tone: "info",
      text: "Davomatni bir marta olasiz. U 16:30 da yopiladi: dars tugaguncha olinmasa, bu dars uchun ish haqi yozilmaydi.",
    });
  });

  it("tells an admin how long corrections stay open", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: true, hasAttendance: true })?.text).toBe(
      "Tuzatish 16:30 gacha ochiq (dars tugaguncha). Keyin davomat yopiladi: hech kim o'zgartira olmaydi.",
    );
  });

  it("tells an admin the teacher has not taken it yet", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: true })?.text).toBe(
      "Ustoz hali davomat olmagan. 16:30 gacha siz olsangiz, ustoz haqi saqlanib qoladi.",
    );
  });

  it("says a lesson without attendance cost the teacher its pay", () => {
    expect(windowBanner({ ...base, state: "closed", isAdmin: false })).toEqual({
      tone: "danger",
      text: "Dars tugadi, davomat olinmadi. Bu dars uchun ustozga ish haqi yozilmadi. Davomatni endi saytda hech kim kirita olmaydi.",
    });
  });

  it("says a taken lesson is closed", () => {
    expect(windowBanner({ ...base, state: "closed", isAdmin: true, hasAttendance: true })?.text).toBe(
      "Dars tugagan. Davomat yopilgan: endi uni saytda o'zgartirib bo'lmaydi.",
    );
  });

  it("announces when a lesson opens", () => {
    expect(windowBanner({ ...base, state: "before", isAdmin: false })?.text).toBe(
      "Dars 15:00 da boshlanadi. Davomat 14:50 da ochiladi.",
    );
    expect(windowBanner({ ...base, state: "before", isAdmin: false, isToday: false })?.text).toBe(
      "Bu dars hali boshlanmagan. Davomat dars kuni ochiladi.",
    );
  });

  it("confirms the teacher's own save", () => {
    expect(
      windowBanner({
        ...base,
        state: "open",
        isAdmin: false,
        hasAttendance: true,
        alreadyTakenForTeacher: true,
      }),
    ).toEqual({
      tone: "success",
      text: "Davomat olib bo'lingan. Dars tugaguncha administrator tuzata oladi.",
    });
  });
});
