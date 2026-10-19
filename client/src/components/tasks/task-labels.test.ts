import { describe, expect, it } from "vitest";
import type { TaskKind, TaskPriority, TaskStatus } from "@/hooks/use-tasks";
import { entityText, kindText, priorityText, statusText } from "./task-labels";

describe("task label helpers", () => {
  it("keep the Uzbek labels of known codes", () => {
    expect(statusText("IN_REVIEW")).toBe("Tekshiruvda");
    expect(priorityText("URGENT")).toBe("Shoshilinch");
    expect(kindText("CALLBACK")).toBe("Qayta qo'ng'iroq");
    expect(kindText("MANUAL")).toBe("");
    expect(entityText("Student")).toBe("O'quvchi");
  });

  it("show an unknown code as sent, never through t()", () => {
    const t = (s: string) => `T(${s})`;
    expect(statusText("ON_HOLD" as TaskStatus, t)).toBe("ON_HOLD");
    expect(priorityText("CRITICAL" as TaskPriority, t)).toBe("CRITICAL");
    expect(kindText("NEW_KIND" as TaskKind, t)).toBe("NEW_KIND");
    expect(entityText("Room", t)).toBe("Room");
    expect(statusText("DONE", t)).toBe("T(Bajarildi)");
  });
});
