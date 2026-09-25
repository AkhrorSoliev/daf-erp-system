import { describe, expect, it } from "vitest";
import { branchUpdateBody, toBranch } from "./branch-record";

/**
 * A branch's state is `Branch.status` (ACTIVE, INACTIVE, CLOSED, ARCHIVED).
 *
 * The settings screens used to show a "Faol/Nofaol" badge built from
 * `isActive`, and the edit form wrote `isActive` back. Nothing on the server
 * reads that flag — the Telegram bot and the status cascade go by `status` —
 * so the form could mark a branch "Nofaol" while it kept accepting
 * registrations. The status is now changed only through
 * `PATCH /branches/:id/status`.
 */
describe("toBranch", () => {
  const row = {
    id: 3,
    name: "Filial",
    address: null,
    phone: "901234567",
    isActive: true,
    status: "CLOSED",
    startOfWorkingDay: "08:00",
    endOfWorkingDay: null,
  };

  it("takes the state from status, not from isActive", () => {
    expect(toBranch(row).status).toBe("CLOSED");
  });

  it("turns the id into a string and missing text fields into empty strings", () => {
    expect(toBranch(row)).toEqual({
      id: "3",
      name: "Filial",
      address: "",
      phone: "901234567",
      status: "CLOSED",
      startOfWorkingDay: "08:00",
      endOfWorkingDay: "",
    });
  });
});

describe("branchUpdateBody", () => {
  const values = {
    name: "Filial",
    address: "",
    phone: "901234567",
    startOfWorkingDay: "08:00",
    endOfWorkingDay: "",
  };

  it("never carries isActive or status", () => {
    const body = branchUpdateBody(values);
    expect(body).not.toHaveProperty("isActive");
    expect(body).not.toHaveProperty("status");
  });

  it("sends empty optional fields as undefined", () => {
    expect(branchUpdateBody(values)).toEqual({
      name: "Filial",
      address: undefined,
      phone: "901234567",
      startOfWorkingDay: "08:00",
      endOfWorkingDay: undefined,
    });
  });
});
