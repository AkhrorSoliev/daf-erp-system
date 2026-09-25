import { describe, expect, it } from "vitest";
import { branchClosedToRegistration } from "./telegram-link";

/**
 * The bot's `/start` accepts a student or student-group link only for a
 * branch whose status is ACTIVE, and answers anything else with "Filial
 * topilmadi" (server/CLAUDE.md, "Registration deep links"). The students page
 * and the group card must not hand out a link the bot will refuse — but they
 * must not take a working link away either.
 */
describe("branchClosedToRegistration — does the bot refuse this branch?", () => {
  it.each([
    ["INACTIVE", true],
    ["CLOSED", true],
    ["ARCHIVED", true],
    ["ACTIVE", false],
  ])("%s → %s", (status, refused) => {
    expect(branchClosedToRegistration(status)).toBe(refused);
  });

  it("does not refuse when the status is unknown", () => {
    // The list has not loaded yet, or the sign-in cookie predates the payload
    // carrying branch status. Treating that as closed would take every link
    // away from everyone until their next token refresh; the bot still
    // decides.
    expect(branchClosedToRegistration(undefined)).toBe(false);
  });
});
