import { describe, expect, it } from "vitest";
import { COMPANY, copyrightLine } from "./company";

describe("copyrightLine", () => {
  it("names the legal entity and the year, then the Uzbek rights sentence by default", () => {
    expect(copyrightLine(2026)).toBe(`© 2026 ${COMPANY.legalName}. Barcha huquqlar himoyalangan.`);
  });

  it("takes the rights sentence from the caller, so the entity name stays exactly as registered", () => {
    expect(copyrightLine(2026, "All rights reserved.")).toBe(`© 2026 ${COMPANY.legalName}. All rights reserved.`);
  });
});
