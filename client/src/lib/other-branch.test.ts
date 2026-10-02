import { describe, expect, it } from "vitest";
import { otherBranchOf } from "./other-branch";

const axiosError = (status: number, data: unknown) => ({
  response: { status, data },
});

describe("otherBranchOf", () => {
  it("reads the branch a 404 names for a group of another branch", () => {
    expect(
      otherBranchOf(
        axiosError(404, {
          message: "Bu guruh «Namangan filiali» filialiga tegishli.",
          branch: { id: 2, name: "Namangan filiali" },
        }),
      ),
    ).toEqual({ id: 2, name: "Namangan filiali" });
  });

  it("is null for a group that is really missing", () => {
    expect(
      otherBranchOf(axiosError(404, { message: "Guruh #x topilmadi" })),
    ).toBeNull();
  });

  it("is null for any other failure", () => {
    expect(
      otherBranchOf(axiosError(500, { branch: { id: 2, name: "N" } })),
    ).toBeNull();
    expect(otherBranchOf(new Error("Network Error"))).toBeNull();
    expect(otherBranchOf(undefined)).toBeNull();
  });
});
